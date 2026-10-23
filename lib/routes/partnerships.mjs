import crypto from 'node:crypto';
import fs from 'node:fs';

export const PROGRAM = JSON.parse(fs.readFileSync(new URL('../../data/partner-program.json',import.meta.url),'utf8'));
const DAY=86400000;
const now=()=>new Date().toISOString();
const codeOf=s=>String(s||'').trim().toUpperCase();
const codeOK=s=>/^AZP[A-F0-9]{10}$/.test(s);
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const book=ctx=>{
  try{
    if(!ctx.db.cache.has('partner-book')&&fs.existsSync(ctx.db.file('partner-book')))ctx.db.cache.set('partner-book',JSON.parse(fs.readFileSync(ctx.db.file('partner-book'),'utf8')));
    const b=ctx.db.get('partner-book',{partners:[],payouts:[],settlements:{},visits:{},audit:[]});
    if(!b||!Array.isArray(b.partners)||!Array.isArray(b.payouts)||!Array.isArray(b.audit)||!b.settlements||!b.visits)throw new Error('Invalid partnership records');
    if(Array.isArray(b.settlements))b.settlements=Object.assign({},b.settlements);if(Array.isArray(b.visits))b.visits=Object.assign({},b.visits);return b;
  }catch{throw new Error('Partnership records are temporarily unavailable. Please contact Aarzu by email.');}
};
const save=(ctx,b)=>ctx.db.set('partner-book',b);
const audit=(b,type,detail)=>{b.audit.push({type,...detail,at:now()});b.audit=b.audit.slice(-10000);};
const current=(req,ctx)=>{let t;try{t=ctx.parseCookies(req).az_session;}catch{return null;}if(!/^[a-f0-9]{64}$/.test(t||''))return null;const s=ctx.db.get('sessions',[]).find(s=>s.token===sha(t)&&Date.parse(s.expiresAt)>Date.now());return s?ctx.db.get('accounts',[]).find(a=>a.id===s.accountId)||null:null;};
const cookieCode=(req,ctx)=>{try{return codeOf(ctx.parseCookies(req).az_partner);}catch{return '';}};
const active=(ctx,c)=>codeOK(codeOf(c))?book(ctx).partners.find(p=>p.code===codeOf(c)&&p.status==='active'):null;
const publicPartner=p=>({id:p.id,name:p.name,email:p.email,channel:p.channel,code:p.code,status:p.status,statusNote:p.statusNote||'',createdAt:p.createdAt,acceptedVersion:p.acceptedVersion,visits:p.visits||0});
export function resolveCoupon(code,ctx){return active(ctx,code)?{type:'percent',value:PROGRAM.viewerDiscountPercent,label:`Creator discount · ${PROGRAM.viewerDiscountPercent}% off`}:null;}
export function referralCoupon(req,ctx){const code=cookieCode(req,ctx);return active(ctx,code)?code:null;}

export function commissionBase(o,products){
  let eligible=0;
  for(const i of o.items||[]){const p=products[i.id];if(!p||p.category==='giftcard'||p.unlisted||i.meta?.digital)continue;const add=(i.addons||[]).reduce((s,a)=>s+Number(a.price||0),0);eligible+=Math.max(0,Number(i.unit)-add)*Number(i.qty);}
  const subtotal=Number(o.subtotal)||0,discount=(o.discounts||[]).reduce((s,x)=>s+Number(x.amount||0),0),credit=(o.credits||[]).reduce((s,x)=>s+Number(x.amount||0),0);
  return subtotal>0?Math.max(0,Math.round(eligible*Math.max(0,subtotal-discount-credit)/subtotal)):0;
}
export function decorateOrder(o,ctx,req){
  const byCode=active(ctx,o.coupon),p=byCode||active(ctx,cookieCode(req,ctx));if(!p)return;
  const account=current(req,ctx);
  if(p.accountId===account?.id||p.phone===o.customer.phone||(o.customer.email&&p.email.toLowerCase()===o.customer.email.toLowerCase()))return;
  const base=commissionBase(o,ctx.catalog.byId);if(!base)return;
  o.partner={id:p.id,code:p.code,base,commission:Math.round(base*PROGRAM.commissionPercent/100),rate:PROGRAM.commissionPercent,holdDays:PROGRAM.holdDays,source:byCode?'code':'link',termsVersion:PROGRAM.version};
}

export function orderEntry(o,b,t=Date.now()){
  const p=o.partner;if(!p)return null;
  const settlement=b.settlements[o.id],refunded=Math.max(0,Math.min(p.base,Number(settlement?.refunded)||0));
  const amount=Math.round(Math.max(0,p.base-refunded)*p.rate/100);
  const delivered=(o.history||[]).filter(x=>x.status==='delivered').at(-1)?.at;
  const availableAt=Number.isFinite(Date.parse(delivered))?new Date(Date.parse(delivered)+p.holdDays*DAY).toISOString():null;
  const state=['cancelled','returned'].includes(o.status)||refunded>=p.base?'reversed':o.status!=='delivered'||!availableAt?'pending':!settlement?.receivedAt?'awaiting_payment':t<Date.parse(availableAt)?'holding':'available';
  return {orderId:o.id,createdAt:o.createdAt,status:o.status,base:p.base,refunded,commission:amount,originalCommission:p.commission,rate:p.rate,state,availableAt,paymentConfirmedAt:settlement?.receivedAt||null,source:p.source};
}
export function summary(p,ctx,b=book(ctx)){
  const entries=ctx.orders().filter(o=>o.partner?.id===p.id).map(o=>orderEntry(o,b)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const payouts=b.payouts.filter(x=>x.partnerId===p.id),paid=payouts.filter(x=>x.status==='paid').reduce((s,x)=>s+x.amount,0),reserved=payouts.filter(x=>x.status==='requested').reduce((s,x)=>s+x.amount,0);
  const earned=entries.filter(e=>e.state==='available').reduce((s,e)=>s+e.commission,0);
  return {partner:publicPartner(p),program:PROGRAM,entries,payouts:payouts.map(({bank,...x})=>({...x,bankName:bank.bankName,accountTitle:bank.accountTitle,accountLast4:bank.account.slice(-4)})).reverse(),totals:{visits:p.visits||0,orders:entries.length,pending:entries.filter(e=>!['available','reversed'].includes(e.state)).reduce((s,e)=>s+e.commission,0),earned,paid,reserved,available:Math.max(0,earned-paid-reserved),adjustment:Math.max(0,paid-earned),reversed:entries.filter(e=>e.state==='reversed').reduce((s,e)=>s+e.originalCommission,0)}};
}
function bankDetails(b,ctx){const bank={bankName:ctx.clean(b.bankName,80),accountTitle:ctx.clean(b.accountTitle,100),account:String(b.account||'').replace(/\s/g,'').toUpperCase()};if(bank.bankName.length<2||bank.accountTitle.length<2||!(/^[0-9]{6,24}$/.test(bank.account)||/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(bank.account)))throw new Error('Enter the bank name, account title and a valid Pakistani account number or 24-character IBAN.');if(b.confirmBank!==true)throw new Error('Please confirm these are your correct bank details.');return bank;}
function channelOf(raw){try{const u=new URL(String(raw||''));return u.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(u.hostname)&&u.pathname.length>1?u.href.slice(0,250):null;}catch{return null;}}
function referralCookies(req,code){const secure=req.socket?.encrypted||/^https/i.test(String(req.headers['x-forwarded-proto']||''))?'; Secure':'';return [`az_partner=${code||''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${code?PROGRAM.attributionDays*86400:0}${secure}`];}
const hitMap=new Map();
function limited(req){const key=req.socket?.remoteAddress||'?',t=Date.now(),list=(hitMap.get(key)||[]).filter(x=>t-x<3600000);list.push(t);hitMap.set(key,list);if(hitMap.size>5000)for(const[k,v]of hitMap)if(!v.some(x=>t-x<3600000))hitMap.delete(k);return list.length>300;}

export async function handle(req,res,url,ctx){
  const path=url.pathname,M=req.method;if(!path.startsWith('/api/partners/')&&!path.startsWith('/api/admin/partners'))return false;
  const reply=(status,data,extra={})=>{ctx.send(req,res,status,data,'application/json; charset=utf-8',{'Cache-Control':'no-store','X-Robots-Tag':'noindex',...extra});return true;};
  const fail=(status,error)=>reply(status,{error});
  if(!['GET','HEAD'].includes(M)&&req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host)return fail(403,'Please submit this request from the store.');}catch{return fail(403,'Invalid origin.');}}
  if(path==='/api/partners/program'&&M==='GET')return reply(200,PROGRAM);
  if(path==='/api/partners/referral'&&['GET','POST'].includes(M)){
    const raw=M==='POST'?await ctx.readBody(req,2000):{},code=codeOf(M==='POST'?raw.code:cookieCode(req,ctx)),p=active(ctx,code);
    if(!p)return reply(200,{coupon:null},{'Set-Cookie':referralCookies(req,null)});
    if(M==='POST'&&/^[a-zA-Z0-9_-]{10,64}$/.test(raw.sid||'')&&!limited(req)){
      const b=book(ctx),day=new Date().toISOString().slice(0,10),key=sha(`${day}:${code}:${raw.sid}`);
      if(!b.visits[key]){b.visits[key]=Date.now();p.visits=(p.visits||0)+1;}
      for(const[k,t]of Object.entries(b.visits))if(Date.now()-t>PROGRAM.attributionDays*DAY)delete b.visits[k];
      if(Object.keys(b.visits).length>20000)b.visits=Object.fromEntries(Object.entries(b.visits).slice(-20000));save(ctx,b);
    }
    return reply(200,{coupon:{...resolveCoupon(code,ctx),code}},M==='POST'?{'Set-Cookie':referralCookies(req,code)}:{});
  }
  const admin=path.startsWith('/api/admin/');if(admin&&!ctx.adminOk(req))return fail(401,'Please sign in to admin.');
  const account=admin?null:current(req,ctx);if(!admin&&!account)return fail(401,'Please sign in to your Aarzu account.');
  const b=book(ctx),mine=account&&b.partners.find(p=>p.accountId===account.id);
  if(path==='/api/partners/me'&&M==='GET')return reply(200,mine?summary(mine,ctx,b):{partner:null,program:PROGRAM,account:{name:account.name,email:account.email||'',phone:account.phone}});
  const body=['POST','PATCH'].includes(M)?await ctx.readBody(req,12000):{};
  if(path==='/api/partners/join'&&M==='POST'){
    if(mine)return reply(200,summary(mine,ctx,b));if(limited(req))return fail(429,'Too many requests. Please try later.');
    const channel=channelOf(body.channel),name=ctx.clean(body.name||account.name,80),email=ctx.clean(body.email||account.email,120).toLowerCase();
    if(!channel||name.length<2||!ctx.validEmail(email))return fail(422,'Enter your name, a valid email and your public YouTube channel link.');
    if(body.acceptTerms!==true)return fail(422,'Please read and accept the partnership terms.');
    if(b.partners.some(p=>p.email.toLowerCase()===email||p.channel.toLowerCase().replace(/\/$/,'')===channel.toLowerCase().replace(/\/$/,'')))return fail(409,'An application already uses that email or channel. Sign in to the original account or contact Aarzu by email.');
    let code;do{code='AZP'+crypto.randomBytes(5).toString('hex').toUpperCase();}while(b.partners.some(p=>p.code===code));
    const p={id:'PT'+crypto.randomBytes(8).toString('hex').toUpperCase(),accountId:account.id,name,email,phone:account.phone,channel,code,status:'pending',createdAt:now(),acceptedVersion:PROGRAM.version,visits:0};b.partners.push(p);audit(b,'application',{partnerId:p.id});save(ctx,b);return reply(201,summary(p,ctx,b));
  }
  if(path==='/api/partners/payouts'&&M==='POST'){
    if(!mine||mine.status!=='active')return fail(403,'Your partnership must be active before requesting a payout.');
    if(b.payouts.some(x=>x.partnerId===mine.id&&x.status==='requested'))return fail(409,'You already have a payout request being reviewed.');
    const s=summary(mine,ctx,b),amount=s.totals.available;if(amount<PROGRAM.minimumPayout)return fail(422,`The minimum available balance is PKR ${PROGRAM.minimumPayout}.`);
    let bank;try{bank=bankDetails(body,ctx);}catch(e){return fail(422,e.message);}
    const p={id:'PO'+crypto.randomBytes(8).toString('hex').toUpperCase(),partnerId:mine.id,amount,status:'requested',createdAt:now(),bank,termsVersion:PROGRAM.version};b.payouts.push(p);audit(b,'payout_requested',{partnerId:mine.id,payoutId:p.id,amount});save(ctx,b);return reply(201,summary(mine,ctx,b));
  }
  if(path==='/api/admin/partners'&&M==='GET')return reply(200,{program:PROGRAM,partners:b.partners.map(p=>({...summary(p,ctx,b),phone:p.phone})).reverse(),payouts:b.payouts.map(p=>({...p,partnerName:b.partners.find(x=>x.id===p.partnerId)?.name||''})).reverse(),audit:b.audit.slice(-100).reverse()});
  const state=path.match(/^\/api\/admin\/partners\/(PT[A-F0-9]{16})\/status$/);
  if(state&&M==='PATCH'){
    const p=b.partners.find(x=>x.id===state[1]);if(!p)return fail(404,'Creator not found.');if(!['active','paused','rejected'].includes(body.status))return fail(422,'Choose an active, paused or rejected status.');const note=ctx.clean(body.note,300);if(body.status!=='active'&&note.length<3)return fail(422,'Add a reason for the creator.');p.status=body.status;p.statusNote=note;p.updatedAt=now();audit(b,'creator_status',{partnerId:p.id,status:p.status,note});save(ctx,b);return reply(200,summary(p,ctx,b));
  }
  const payment=path.match(/^\/api\/admin\/partners\/orders\/([A-Z0-9]+)\/payment$/);
  if(payment&&M==='POST'){
    const o=ctx.orders().find(o=>o.id===payment[1]&&o.partner);if(!o)return fail(404,'Referral order not found.');if(o.status!=='delivered')return fail(409,'Only a delivered order can have its collected payment confirmed.');const reference=ctx.clean(body.reference,120);if(reference.length<3||body.confirmReceived!==true)return fail(422,'Confirm the payment was collected and enter its settlement reference.');
    const refunded=body.refunded??0;if(!Number.isInteger(refunded)||refunded<0||refunded>o.partner.base)return fail(422,'Refunded product amount must be between zero and the eligible product amount.');const old=b.settlements[o.id];b.settlements[o.id]={receivedAt:old?.receivedAt||now(),reference,refunded,updatedAt:now()};audit(b,'order_payment',{orderId:o.id,partnerId:o.partner.id,refunded,reference});save(ctx,b);return reply(200,orderEntry(o,b));
  }
  const payout=path.match(/^\/api\/admin\/partners\/payouts\/(PO[A-F0-9]{16})$/);
  if(payout&&M==='PATCH'){
    const p=b.payouts.find(x=>x.id===payout[1]);if(!p)return fail(404,'Payout not found.');if(p.status!=='requested')return fail(409,'This payout has already been processed.');
    if(body.status==='paid'){
      const creator=b.partners.find(x=>x.id===p.partnerId),s=summary(creator,ctx,b);if(creator.status!=='active'||s.totals.earned-s.totals.paid-s.totals.reserved+p.amount<p.amount)return fail(409,'This balance is no longer payable. Review returned/refunded orders and reject the request with a reason.');
      const reference=ctx.clean(body.reference,120);if(reference.length<3||body.confirmTransferred!==true)return fail(422,'Make the bank transfer first, then confirm it and enter the bank transaction reference.');p.status='paid';p.reference=reference;p.paidAt=now();
    }else if(body.status==='rejected'){const reason=ctx.clean(body.reason,300);if(reason.length<3)return fail(422,'Enter the reason shown to the creator.');p.status='rejected';p.reason=reason;p.reviewedAt=now();}else return fail(422,'Choose paid or rejected.');
    audit(b,'payout_'+p.status,{partnerId:p.partnerId,payoutId:p.id,amount:p.amount,reference:p.reference||null,reason:p.reason||null});save(ctx,b);return reply(200,{id:p.id,status:p.status});
  }
  return fail(404,'Partnership route not found.');
}
