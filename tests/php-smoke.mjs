// Run against an isolated temporary store: node tests/php-smoke.mjs (requires PHP 8.2+).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Catalog } from '../lib/catalog.mjs';
import { priceCart } from '../public/js/pricing.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aarzu-php-'));
const runtime=path.join(temp,'runtime'); fs.mkdirSync(runtime);
// Exercise order/restock flows using stock in this temporary store only.
const fixtureProduct=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.brands.json'),'utf8')).find(p=>p.category==='unstitched'&&p.stock[p.sizes[0]]>0);
const fixtureInventory={[fixtureProduct.id]:{[fixtureProduct.sizes[0]]:10}};
fs.writeFileSync(path.join(runtime,'inventory.json'),JSON.stringify(fixtureInventory));
const password='test-only-strong-admin-password';
let run, shutdown=()=>{}, cookies='', warnings=[];
if(process.env.PHP_WASM_MODULES) {
  const base=process.env.PHP_WASM_MODULES;
  const { PHP }=await import(pathToFileURL(path.join(base,'@php-wasm/universal/index.js')));
  const { loadNodeRuntime,createNodeFsMountHandler }=await import(pathToFileURL(path.join(base,'@php-wasm/node/index.js')));
  const php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:1234}}));
  for(const [virtual,local] of [['/app',root],['/runtime',runtime],['/backups',path.join(temp,'backups')]]) { fs.mkdirSync(local,{recursive:true}); php.mkdir(virtual); await php.mount(virtual,createNodeFsMountHandler(local)); }
  run=async(p,method,body,headers)=>{
    const r=await php.run({scriptPath:'/app/index.php',relativeUri:p,method,body:body===undefined?undefined:new TextEncoder().encode(body),headers,env:{RUNTIME_DIR:'/runtime',BACKUP_DIR:'/backups',ADMIN_PASSWORD:password,ADMIN_HOST:'admin.aarzu.test'},$_SERVER:{REQUEST_URI:p,HTTP_HOST:headers.host||'localhost',REMOTE_ADDR:'127.0.0.1'}});
    if(r.errors) warnings.push(r.errors);
    return {status:r.httpStatusCode,headers:r.headers,text:r.text};
  };
  shutdown=()=>php.exit();
} else {
  const probe=net.createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve)); const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.env.PHP_BINARY||'php',['-S',`127.0.0.1:${port}`,'-t',root,path.join(root,'index.php')],{cwd:root,env:{...process.env,RUNTIME_DIR:runtime,BACKUP_DIR:path.join(temp,'backups'),ADMIN_PASSWORD:password,ADMIN_HOST:'admin.aarzu.test'},stdio:['ignore','pipe','pipe']});
  let failure; child.on('error',e=>failure=e); shutdown=()=>child.kill();
  child.stderr.on('data',d=>{const s=d.toString();if(/Warning:|Fatal error:|Parse error:|\[aarzu\]/.test(s)) warnings.push(s);});
  run=async(p,method,body,headers)=>{ const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,body,headers,redirect:'manual'}); const h=Object.fromEntries([...r.headers].map(([k,v])=>[k,[v]])); h['set-cookie']=r.headers.getSetCookie(); return {status:r.status,headers:h,text:await r.text()}; };
  for(let i=0;i<100;i++) { if(failure) throw failure; try {await run('/api/catalog','GET',undefined,{});break;}catch{await new Promise(r=>setTimeout(r,50));} }
}
async function request(p,body,{method=body?'POST':'GET',admin=false,session=true,host='localhost',expected=200}={}) {
  const headers={host}; if(body) headers['content-type']='application/json'; if(admin) headers.authorization=`Bearer ${password}`; if(session&&cookies) headers.cookie=cookies;
  const r=await run(p,method,body?JSON.stringify(body):undefined,headers);
  assert.equal(r.status,expected,`${method} ${p}: ${r.status} ${r.text.slice(0,300)}`);
  if(session&&r.headers['set-cookie']?.length) {
    const jar=new Map(cookies.split('; ').filter(Boolean).map(c=>[c.slice(0,c.indexOf('=')),c]));
    for(const c of r.headers['set-cookie']) { const pair=c.split(';')[0]; jar.set(pair.slice(0,pair.indexOf('=')),pair); }
    cookies=[...jar.values()].join('; ');
  }
  return {...r,data:(r.headers['content-type']||[]).some(v=>v.includes('json'))?JSON.parse(r.text):r.text};
}
let phoneNo=1000000;
const customer=()=>({name:'Test Customer',phone:'0300'+String(phoneNo++).padStart(7,'0'),city:'Lahore',address:'12 Test Street, Gulberg, Lahore'});
try {
  const initial=await request('/api/catalog'); const cat=initial.data;
  assert.equal(initial.headers['cache-control'][0],'no-cache');
  const source=Object.create(Catalog.prototype); source.dataDir=path.join(root,'data'); source.photoDir=path.join(root,'public/images/originals/photos'); source.db={get:(name,d)=>name==='inventory'?fixtureInventory:d}; source.files=['originals.json','catalog.brands.json',...fs.readdirSync(source.dataDir).filter(f=>/^catalog\..+\.json$/.test(f)&&f!=='catalog.brands.json').sort(),'media.json'].map(f=>path.join(source.dataDir,f)); source.load();
  assert.deepEqual(cat.products,source.publicList()); assert(!('coupons' in cat.store)); assert(cat.products.every(p=>!p.source));
  const byId=Object.fromEntries(cat.products.map(p=>[p.id,p])); const store=JSON.parse(fs.readFileSync(path.join(root,'data/store.json')));
  const p=cat.products.find(p=>p.category==='unstitched'&&p.stock[p.sizes[0]]>3); const line={id:p.id,size:p.sizes[0],qty:1};
  const cases=[[],[line],[{...line,qty:3}],[{...line,qty:0}],[{...line,addons:[{key:'stitching',option:Object.keys(store.addons.stitching.options)[0]}]}]];
  for(const items of cases) {const r=(await request('/api/quote',{items})).data; delete r.couponError; assert.deepEqual(r,priceCart(items,byId,store));}
  for(const asset of ['/js/app.js','/css/style.css','/brand/aarzu-mark.svg','/sw.js']) {const r=await request(asset);assert.equal(r.text,fs.readFileSync(path.join(root,'public',asset),'utf8'));}
  for(const secret of ['/data/store.json','/data/runtime/orders.json','/php/bootstrap.php','/.env','/.git/config','/server.mjs']) await request(secret,null,{expected:404});
  assert((await request('/shop')).text.includes('/js/app.js')); assert((await request('/product/'+p.slug)).text.includes('property="og:type" content="product"')); assert((await request('/sitemap.xml')).text.includes('/product/'+p.slug));
  await request('/',null,{host:'admin.aarzu.test',expected:302});
  await request('/api/admin/summary',null,{expected:401});
  console.log('PASS catalogue and pricing match Node; unchanged assets, routes, SEO and private files');

  const ac=customer(); const member=(await request('/api/account/register',{name:ac.name,phone:ac.phone,password:'member-password-123'},{expected:201})).data; assert.equal(member.points,200); assert(!('hash' in member)); assert.equal((await request('/api/account/me')).data.id,member.id);
  await request('/api/account/password',{current:'wrong',next:'new-member-password'},{expected:422});
  await request('/api/account/me',{addresses:[{label:'Home',city:'Lahore',address:ac.address}]},{method:'PUT'});
  await request('/api/admin/accounts/'+member.id+'/points',{delta:400,note:'Test adjustment'},{admin:true}); assert.equal((await request('/api/account/me')).data.points,600);
  await request('/api/admin/coupons',{code:'PHPTEST10',type:'percent',value:10,minSubtotal:1000,label:'Test discount',maxUses:1},{admin:true,expected:201});
  const cpn=(await request('/api/coupon',{code:'PHPTEST10',phone:ac.phone})).data;
  const q=(await request('/api/quote',{items:[line],code:'PHPTEST10'})).data; delete q.couponError; assert.deepEqual(q,priceCart([line],byId,store,cpn));
  await request('/api/alerts/checkout-draft',{sid:'testsession123',name:ac.name,phone:ac.phone,city:'Lahore',items:[line],total:q.total});
  const o=(await request('/api/orders',{customer:ac,payment:'cod',items:[line],code:'PHPTEST10'},{expected:201})).data;
  assert.equal(o.total,q.total); assert.equal((await request('/api/catalog')).data.products.find(x=>x.id===p.id).stock[line.size],p.stock[line.size]-1);
  await request('/api/orders/'+o.id+'?phone=03009999999',null,{expected:404});
  const tracked=(await request('/api/orders/'+o.id+'?phone='+ac.phone)).data; assert.deepEqual(Object.keys(tracked.customer).sort(),['city','name']); assert(!('adminNote' in tracked));
  await request('/api/coupon',{code:'PHPTEST10'},{expected:400});
  for(const status of ['confirmed','dispatched','delivered']) await request('/api/admin/orders/'+o.id,{status,courier:store.couriers[0].name,tracking:'TEST123'},{admin:true,method:'PATCH'});
  const earned=(await request('/api/account/me')).data.points; assert(earned>600); await request('/api/admin/orders/'+o.id,{status:'delivered'},{admin:true,method:'PATCH'}); assert.equal((await request('/api/account/me')).data.points,earned);
  await request('/api/admin/orders/'+o.id,{status:'cancelled'},{admin:true,method:'PATCH'}); assert.equal((await request('/api/account/me')).data.points,600);
  assert.equal((await request('/api/catalog')).data.products.find(x=>x.id===p.id).stock[line.size],p.stock[line.size]);
  console.log('PASS accounts, addresses, coupons, order persistence, tracking, stock, rewards and cancellation');

  const gift=cat.products.find(x=>x.category==='giftcard'); const giftLine={id:gift.id,size:gift.sizes[0],qty:1,meta:{digital:true,to:'Test Recipient',toContact:'03001112222',message:'Test gift'}};
  await request('/api/quote',{items:[{...giftLine,meta:{digital:true}}]},{expected:422});
  const bought=(await request('/api/orders',{customer:customer(),payment:'bank',items:[giftLine]},{expected:201})).data;
  await request('/api/admin/orders/'+bought.id,{status:'confirmed'},{admin:true,method:'PATCH'});
  const card=(await request('/api/admin/giftcards',null,{admin:true})).data.find(c=>c.orderId===bought.id); assert.equal(card.status,'active');
  const balance=(await request('/api/giftcards/'+card.code)).data; assert.equal(balance.balance,gift.price); assert(balance.code.includes('••••'));
  const credits=[{key:'points',payload:{points:500}},{key:'giftcard',payload:{code:card.code}}];
  const reduced=(await request('/api/quote',{items:[line],credits})).data; assert.equal(reduced.credits.length,2);
  const paid=(await request('/api/orders',{customer:customer(),payment:'bank',items:[line],credits},{expected:201})).data; assert.equal(paid.total,reduced.total); assert.equal((await request('/api/account/me')).data.points,100);
  await request('/api/admin/orders/'+paid.id,{status:'cancelled'},{admin:true,method:'PATCH'}); assert.equal((await request('/api/account/me')).data.points,600); assert.equal((await request('/api/giftcards/'+card.code)).data.balance,gift.price);
  await request('/api/admin/giftcards/'+card.code,{action:'sent'},{admin:true});
  console.log('PASS gift-card purchase, activation, masked balance, combined credits and refunds');

  await request('/api/admin/stock',{id:p.id,size:line.size,qty:0},{admin:true});
  const rs={id:p.id,size:line.size,phone:customer().phone}; await request('/api/alerts/restock',rs,{expected:201}); assert.equal((await request('/api/alerts/restock',rs)).data.already,true);
  await request('/api/admin/stock',{id:p.id,size:line.size,qty:1},{admin:true}); const groups=(await request('/api/admin/alerts/restock',null,{admin:true})).data.groups; assert.equal(groups[0].people[0].status,'notified');
  await request('/api/admin/alerts/restock/'+groups[0].people[0].id,{contacted:true},{admin:true});
  await request('/api/orders',{customer:customer(),payment:'bank',items:[line]},{expected:201});
  await request('/api/orders',{customer:customer(),payment:'bank',items:[line]},{expected:409});
  assert.equal((await request('/api/admin/alerts/drafts',null,{admin:true})).data.recovered,1);
  for(const name of ['newsletter','waitlist']) { await request('/api/'+name,{contact:'03002223333',interest:'test'},{expected:201}); assert.equal((await request('/api/'+name,{contact:'03002223333'})).data.already,true); }
  await request('/api/contact',{name:'Test Customer',email:'test@example.test',message:'Test contact message'},{expected:201}); assert.equal((await request('/api/admin/messages',null,{admin:true})).data.length,1);
  const spin=(await request('/api/spin',{contact:'03002223333'})).data; assert.equal(spin.prize.label,store.wheel[spin.index].label);
  const summary=(await request('/api/admin/summary',null,{admin:true})).data; assert(summary.orders>=4); assert.equal(summary.members,1);
  const insights=(await request('/api/admin/insights?days=30',null,{admin:true})).data; assert(insights.series.length===30); assert(Array.isArray(insights.topProducts));
  for(const kind of ['orders','courier']) assert((await request('/api/admin/export/'+kind+'.csv',null,{admin:true})).text.includes(kind==='orders'?bought.id:'consignee name'));
  const reset=(await request('/api/admin/accounts/'+member.id+'/password',{}, {admin:true})).data; await request('/api/account/me',null,{expected:401}); await request('/api/account/login',{phone:ac.phone,password:reset.temp});
  await request('/api/account/logout',{}); await request('/api/account/me',null,{expected:401});
  for(let i=0;i<10;i++) await request('/api/admin/summary',null,{expected:401});
  await request('/api/admin/summary',null,{expected:429});
  assert((await request('/api/catalog')).data.products.length>0);
  assert.deepEqual(warnings,[]);
  console.log('PASS restock alerts, drafts, oversell protection, forms, spin, admin reports, CSV and password reset');
  console.log('All PHP compatibility checks passed.');
} catch(e) { console.error(e.message.slice(0,1400)); console.error(e.stack.split('\n').filter(s=>s.startsWith('    at ')).join('\n')); process.exitCode=1; }
finally { shutdown(); fs.rmSync(temp,{recursive:true,force:true}); }
