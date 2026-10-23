// Financial and authorization contract exercised against Node and Hostinger's PHP runtime.
// All customers, orders, credentials, bank details and transfers below are isolated test fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {commissionBase,orderEntry} from '../lib/routes/partnerships.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.env.PARTNER_TEST_ENGINE||'node';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aarzu-partner-')),runtime=path.join(temp,'runtime');fs.mkdirSync(runtime);
const password='isolated-partner-test-password',warnings=[];
const product=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.brands.json'))).find(p=>p.category==='unstitched'&&p.stock[p.sizes[0]]>0);
fs.writeFileSync(path.join(runtime,'inventory.json'),JSON.stringify({[product.id]:{[product.sizes[0]]:60}}));
let run,shutdown=async()=>{},restart=async()=>{};
if(mode==='php'){
  const modules=process.env.PHP_WASM_MODULES;if(!modules)throw new Error('PHP_WASM_MODULES is required for the PHP contract.');
  const {PHP}=await import(pathToFileURL(path.join(modules,'@php-wasm/universal/index.js')));
  const {loadNodeRuntime,createNodeFsMountHandler}=await import(pathToFileURL(path.join(modules,'@php-wasm/node/index.js')));
  let php;
  const start=async()=>{
    php=new PHP(await loadNodeRuntime('8.3',{emscriptenOptions:{processId:1235}}));
    for(const [virtual,local]of[['/app',root],['/runtime',runtime],['/backups',path.join(temp,'backups')]]){fs.mkdirSync(local,{recursive:true});php.mkdir(virtual);await php.mount(virtual,createNodeFsMountHandler(local));}
    run=async(p,method,body,headers)=>{const r=await php.run({scriptPath:'/app/index.php',relativeUri:p,method,body:body===undefined?undefined:new TextEncoder().encode(body),headers,env:{RUNTIME_DIR:'/runtime',BACKUP_DIR:'/backups',ADMIN_PASSWORD:password,ADMIN_HOST:'admin.aarzu.test'},$_SERVER:{REQUEST_URI:p,HTTP_HOST:headers.host||'localhost',REMOTE_ADDR:'127.0.0.1',...(headers.origin?{HTTP_ORIGIN:headers.origin}:{})}});if(r.errors)warnings.push(r.errors);return{status:r.httpStatusCode,headers:r.headers,text:r.text};};
  };
  shutdown=async()=>{if(php){php.exit();php=null;}};
  restart=async()=>{await shutdown();await start();};await start();
}else{
  let child,port;
  const start=async()=>{const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));port=probe.address().port;await new Promise(r=>probe.close(r));child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),RUNTIME_DIR:runtime,ADMIN_PASSWORD:password,ADMIN_HOST:'admin.aarzu.test'},stdio:['ignore','pipe','pipe']});let error;child.on('error',e=>error=e);child.stderr.on('data',d=>warnings.push(d.toString()));run=async(p,method,body,headers)=>{const r=await fetch(`http://127.0.0.1:${port}${p}`,{method,body,headers,redirect:'manual'});return{status:r.status,headers:{...Object.fromEntries([...r.headers].map(([k,v])=>[k,[v]])),'set-cookie':r.headers.getSetCookie()},text:await r.text()};};for(let i=0;i<100;i++){if(error)throw error;try{await run('/api/catalog','GET',undefined,{host:'localhost'});return;}catch{await new Promise(r=>setTimeout(r,40));}}throw new Error('Test server did not start.');};
  shutdown=async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}child=null;};
  restart=async()=>{await shutdown();await start();};await start();
}
const client=()=>({cookies:''});const creator=client(),viewer=client(),other=client(),admin=client();
async function req(c,p,body,{method=body?'POST':'GET',expected=200,auth=false,headers={}}={}){
  const h={host:'localhost',...headers};if(body)h['content-type']='application/json';if(c.cookies)h.cookie=c.cookies;if(auth)h.authorization=`Bearer ${password}`;
  const r=await run(p,method,body?JSON.stringify(body):undefined,h);assert.equal(r.status,expected,`${mode}: ${method} ${p}: ${r.status} ${r.text.slice(0,300)}`);
  for(const value of r.headers['set-cookie']||[]){const pair=value.split(';')[0],name=pair.split('=')[0],map=new Map(c.cookies.split('; ').filter(Boolean).map(x=>[x.split('=')[0],x]));map.set(name,pair);c.cookies=[...map.values()].join('; ');}
  return {...r,data:JSON.parse(r.text)};
}
const asAdmin=(p,b,opt={})=>req(admin,p,b,{auth:true,...opt});
const orderBody=(n,extra={})=>({customer:{name:'Fixture Buyer '+n,phone:'0301'+String(2000000+n),email:`fixture-buyer-${n}@example.test`,city:'Lahore',address:'12 Isolated Test Street, Lahore'},payment:'cod',items:[{id:product.id,size:product.sizes[0],qty:1}],...extra});
try{
  const program=(await req(viewer,'/api/partners/program')).data;assert.equal(program.commissionPercent,40);assert.equal(program.viewerDiscountPercent,10);assert.equal(program.minimumPayout,5000);
  await req(viewer,'/api/partners/me',null,{expected:401});await req(viewer,'/api/admin/marketing',null,{expected:401});await req(viewer,'/api/admin/partners',null,{expected:401});
  await req(creator,'/api/account/register',{name:'Fixture Creator',phone:'03001234561',email:'creator@example.test',password:'fixture-creator-long-password'},{expected:201});
  await req(creator,'/api/partners/join',{channel:'https://www.youtube.com/@FixtureCreator',acceptTerms:false},{expected:422});
  await req(creator,'/api/partners/join',{channel:'https://attacker.example/@channel',acceptTerms:true},{expected:422});
  let d=(await req(creator,'/api/partners/join',{channel:'https://www.youtube.com/@FixtureCreator',acceptTerms:true},{expected:201})).data;
  const id=d.partner.id,code=d.partner.code;assert.equal(d.partner.status,'pending');assert.match(code,/^AZP[A-F0-9]{10}$/);
  assert.equal((await req(viewer,'/api/partners/referral',{code,sid:'fixture-browser-0001'})).data.coupon,null);
  await req(creator,'/api/partners/payouts',{},{expected:403});
  await req(viewer,'/api/partners/referral',{code,sid:'fixture-browser-0001'},{headers:{origin:'https://attacker.example'},expected:403});
  await asAdmin(`/api/admin/partners/${id}/status`,{status:'active',note:'Verified isolated fixture channel'},{method:'PATCH'});
  const ref=await req(viewer,'/api/partners/referral',{code,sid:'fixture-browser-0001'});assert.equal(ref.data.coupon.value,10);assert.match(ref.headers['set-cookie'].join(' '),/HttpOnly/i);
  await req(viewer,'/api/partners/referral',{code,sid:'fixture-browser-0001'});
  const revisit=await req(viewer,'/api/partners/referral');assert.equal((revisit.headers['set-cookie']||[]).length,0,'visits must not extend the original attribution expiry');
  d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.visits,1);
  const quote=(await req(viewer,'/api/quote',{items:[{id:product.id,size:product.sizes[0],qty:1}]})).data;assert.equal(quote.coupon,code);assert.equal(quote.discounts.find(x=>x.key==='coupon').amount,Math.round(product.price*.1));
  const ids=[];
  for(let i=0;i<5;i++){const placed=(await req(viewer,'/api/orders',orderBody(i,{marketing:i===0?{source:'YouTube',medium:'Creator',campaign:'Autumn launch',content:'video-01',customer:'DO_NOT_STORE',total:1}:i===1?{source:'<script>',medium:'creator',campaign:'bad'}:undefined}),{expected:201})).data;ids.push(placed.id);}
  let all=(await asAdmin('/api/admin/orders')).data;const first=all.find(o=>o.id===ids[0]);assert.deepEqual(first.marketing,{source:'youtube',medium:'creator',campaign:'autumn-launch',content:'video-01'});assert(!all.find(o=>o.id===ids[1]).marketing);const campaigns=(await asAdmin('/api/admin/marketing?days=7')).data;assert.equal(campaigns.campaigns[0].orders,1);assert.equal(campaigns.campaigns[0].delivered,0);assert.equal(campaigns.untaggedOrders,4);assert.equal(campaigns.campaigns[0].orderValue,first.total);const commission=Math.round((product.price-Math.round(product.price*.1))*.4);assert.equal(first.partner.commission,commission);assert.equal(first.partner.rate,40);assert.equal(first.partner.base,product.price-Math.round(product.price*.1));
  const tracked=(await req(viewer,`/api/orders/${ids[0]}?phone=${orderBody(0).customer.phone}`)).data;assert(!('marketing' in tracked),'tracking must not expose campaign metadata');assert(!('partner' in tracked),'tracking must not expose commission snapshots');
  await req(other,'/api/account/register',{name:'Other Fixture',phone:'03001234562',email:'other@example.test',password:'another-long-fixture-password'},{expected:201});
  const privateOther=(await req(other,'/api/partners/me')).data;assert.equal(privateOther.partner,null);assert(!JSON.stringify(privateOther).includes(id));
  const self=(await req(creator,'/api/orders',{...orderBody(20),customer:{...orderBody(20).customer,phone:'03001234561'},code},{expected:201})).data;
  all=(await asAdmin('/api/admin/orders')).data;assert(!all.find(o=>o.id===self.id).partner,'self-referrals must not earn');
  const direct=client(),manual=(await req(direct,'/api/orders',orderBody(21,{partnerCode:code,partner:{commission:999999}}),{expected:201})).data;
  assert.equal((await asAdmin('/api/admin/orders')).data.find(o=>o.id===manual.id).partner.commission,commission);
  for(const orderId of ids){await asAdmin(`/api/admin/orders/${orderId}`,{status:'delivered'},{method:'PATCH'});await asAdmin(`/api/admin/partners/orders/${orderId}/payment`,{reference:'Fixture collection '+orderId,confirmReceived:true,refunded:0});}
  assert.equal((await asAdmin('/api/admin/marketing')).data.campaigns[0].deliveredValue,first.total);d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.available,0);assert.equal(d.entries.filter(e=>e.state==='holding').length,5);await req(creator,'/api/partners/payouts',{},{expected:422});
  // Advance only isolated stored delivery dates, then restart Node to verify persistence too.
  await shutdown();
  const orderFile=path.join(runtime,'orders.json'),aged=JSON.parse(fs.readFileSync(orderFile));for(const o of aged)if(ids.includes(o.id))o.history=o.history.map(h=>h.status==='delivered'?{...h,at:new Date(Date.now()-15*86400000).toISOString()}:h);fs.writeFileSync(orderFile,JSON.stringify(aged));
  await restart();
  d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.available,commission*5);
  const bank={bankName:'Fixture Bank',accountTitle:'Fixture Creator',account:'0001234567890',confirmBank:true,amount:999999};
  await req(creator,'/api/partners/payouts',{...bank,account:'bad'},{expected:422});
  d=(await req(creator,'/api/partners/payouts',bank,{expected:201})).data;assert.equal(d.totals.reserved,commission*5);assert.equal(d.totals.available,0);assert(!JSON.stringify(d).includes(bank.account));let payout=d.payouts[0].id;
  await req(creator,'/api/partners/payouts',bank,{expected:409});await req(creator,`/api/admin/partners/payouts/${payout}`,{status:'paid'},{method:'PATCH',expected:401});
  await asAdmin(`/api/admin/orders/${ids[0]}`,{status:'returned'},{method:'PATCH'});
  await asAdmin(`/api/admin/partners/payouts/${payout}`,{status:'paid',reference:'Fixture bank receipt',confirmTransferred:true},{method:'PATCH',expected:409});
  await asAdmin(`/api/admin/partners/payouts/${payout}`,{status:'rejected',reason:'Balance reduced by returned fixture order'},{method:'PATCH'});
  d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.available,commission*4);
  d=(await req(creator,'/api/partners/payouts',bank,{expected:201})).data;payout=d.payouts[0].id;
  await asAdmin(`/api/admin/partners/payouts/${payout}`,{status:'paid',reference:'Fixture bank receipt',confirmTransferred:false},{method:'PATCH',expected:422});
  await asAdmin(`/api/admin/partners/payouts/${payout}`,{status:'paid',reference:'Fixture bank receipt',confirmTransferred:true},{method:'PATCH'});
  await asAdmin(`/api/admin/partners/payouts/${payout}`,{status:'paid',reference:'Duplicate',confirmTransferred:true},{method:'PATCH',expected:409});
  d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.paid,commission*4);assert.equal(d.totals.available,0);assert(!JSON.stringify(d).includes(orderBody(0).customer.phone));assert(!JSON.stringify(d).includes('Fixture Buyer'));
  await asAdmin(`/api/admin/orders/${ids[1]}`,{status:'returned'},{method:'PATCH'});d=(await req(creator,'/api/partners/me')).data;assert.equal(d.totals.adjustment,commission);const reversedCampaign=(await asAdmin('/api/admin/marketing')).data.campaigns[0];assert.equal(reversedCampaign.cancelled,1);assert.equal(reversedCampaign.orderValue,0);assert.equal(reversedCampaign.deliveredValue,0);
  await asAdmin(`/api/admin/partners/orders/${ids[2]}/payment`,{reference:'Fixture partial refund',confirmReceived:true,refunded:1000});d=(await req(creator,'/api/partners/me')).data;assert.equal(d.entries.find(e=>e.orderId===ids[2]).commission,Math.round((first.partner.base-1000)*.4));
  await asAdmin(`/api/admin/partners/${id}/status`,{status:'paused',note:'Fixture review'},{method:'PATCH'});assert.equal((await req(viewer,'/api/partners/referral')).data.coupon,null);await req(viewer,'/api/coupon',{code},{expected:400});
  await asAdmin('/api/admin/coupons',{code:'AZPRESERVED',type:'percent',value:10},{expected:422});
  assert.equal(warnings.filter(s=>/Warning:|Fatal error:|Parse error:|\[aarzu\]|Error:|skipped partnerships/.test(s)).length,0,warnings.join('\n'));
  await shutdown();
  const corrupt='{"bank":"DO_NOT_LEAK_0001234567890",broken';
  fs.writeFileSync(path.join(runtime,'partner-book.json'),corrupt);await restart();
  const broken=await req(creator,'/api/partners/me',null,{expected:500});assert(!broken.text.includes('DO_NOT_LEAK'));
  await req(client(),'/api/catalog');
  await req(client(),'/api/orders',orderBody(99),{expected:201});
  assert.equal(fs.readFileSync(path.join(runtime,'partner-book.json'),'utf8'),corrupt,'Corrupt financial records must not be silently overwritten');
  console.log(`${mode.toUpperCase()} partnerships contract passed: discount, attribution, ownership, holds, refunds, reservation, idempotent payout and privacy.`);
}finally{await shutdown();fs.rmSync(temp,{recursive:true,force:true});}

// Commission excludes add-ons and gift cards, allocates discounts/credits and never goes below zero.
assert.equal(commissionBase({subtotal:12000,discounts:[{amount:1200}],credits:[{amount:800}],items:[{id:'suit',unit:7000,qty:1,addons:[{price:2000}]},{id:'gift',unit:5000,qty:1}]},{suit:{category:'unstitched'},gift:{category:'giftcard'}}),4167);
assert.equal(orderEntry({id:'X',createdAt:new Date().toISOString(),status:'delivered',history:[],partner:{base:100,commission:40,rate:40,holdDays:14,source:'code'}},{settlements:{X:{receivedAt:new Date().toISOString()}}}).state,'pending');
