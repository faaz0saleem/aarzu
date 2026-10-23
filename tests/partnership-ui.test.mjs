import assert from 'node:assert/strict';
import fs from 'node:fs';
import { icon } from '../public/js/icons.js';

const root=new URL('../',import.meta.url),source=fs.readFileSync(new URL('public/js/features/partnerships.js',root),'utf8');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const {dashboardHTML,payoutDue,publicHeader,publicExtras,creatorCaption}=new Function('esc','rs','icon','img','state','location',source.slice(source.indexOf('const DEFAULT='),source.indexOf('async function renderPage('))+'\nreturn {dashboardHTML,payoutDue,publicHeader,publicExtras,creatorCaption};')(esc,n=>'PKR '+n.toLocaleString('en-PK'),icon,x=>x,{products:[]},{hostname:'localhost',origin:'http://127.0.0.1:8789'});
assert.equal(payoutDue('2026-10-23T06:00:00Z',2),'2026-10-27T18:59:59.999Z');
assert.equal(payoutDue('2026-10-22T06:00:00Z',2),'2026-10-26T18:59:59.999Z');
assert.equal(payoutDue('invalid',2),null);assert(publicHeader().includes('Creator sign in'));assert(publicExtras().includes('data-earnings-calculator'));assert(publicExtras().includes('2 working days'));assert(creatorCaption({code:'AZP1234567890'}).includes('Affiliate disclosure'));assert(creatorCaption({code:'AZP1234567890'}).includes('utm_source=youtube'));
const data={partner:{name:'Ayesha <script>alert(1)</script>',status:'active',code:'AZP1234567890'},program:JSON.parse(fs.readFileSync(new URL('data/partner-program.json',root))),totals:{available:6000,pending:1200,reserved:0,paid:2400,visits:120,orders:8,adjustment:0},entries:[],payouts:[]};
let html=dashboardHTML(data,'payouts');assert(html.includes('azw-shell'));assert(!/class="[^"]*\bad-/.test(html));assert(html.includes('data-payout'));assert(html.includes('2 working days'));assert(!html.includes('<script>'));assert(!html.includes('fixture-buyer')); 
for(const patch of [{available:4999},{reserved:6000}]){const blocked=structuredClone(data);Object.assign(blocked.totals,patch);assert(!dashboardHTML(blocked,'payouts').includes('<form data-payout'));}
const pending=structuredClone(data);pending.partner.status='pending';assert(!dashboardHTML(pending,'payouts').includes('<form data-payout'));
data.payouts=[{amount:6000,status:'requested',bankName:'Fixture bank',accountTitle:'Fixture creator',accountLast4:'1234',createdAt:'2026-10-23T06:00:00Z'}];
assert(dashboardHTML(data,'payouts').includes('27 Oct 2026'));
for(const tab of ['overview','orders','payouts','resources','terms']){const rendered=dashboardHTML(data,tab);assert(rendered.includes('data-creator-tab="payouts"'));assert(rendered.includes('Sign out'));}
if(process.env.PARTNER_UI_PREVIEW){fs.mkdirSync(process.env.PARTNER_UI_PREVIEW,{recursive:true});for(const tab of ['overview','payouts'])fs.writeFileSync(process.env.PARTNER_UI_PREVIEW+'/'+tab+'.html',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/features/partnerships.css"><link rel="stylesheet" href="/css/features/admin-design.css"></head><body class="creator-workspace"><main class="azp azp-workspace">${dashboardHTML({...data,partner:{...data.partner,name:'Ayesha Studio'}},tab)}</main></body></html>`);}
console.log('PASS creator payout eligibility, private statement, escaped output and Pakistan working-day dates');
