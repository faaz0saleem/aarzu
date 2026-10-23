import assert from 'node:assert/strict';
import fs from 'node:fs';
import { campaignLink, cleanCampaign, campaignFromUrl, campaignReport, CAMPAIGN_DAYS } from '../public/js/marketing.js';

const fields={source:'YouTube',medium:'Creator',campaign:'Autumn launch',content:'video-01'};
assert.deepEqual(cleanCampaign({...fields,total:1,customer:'secret'}),{source:'youtube',medium:'creator',campaign:'autumn-launch',content:'video-01'});
for(const raw of [null,[],42,{...fields,source:'<script>'},{...fields,campaign:'x'.repeat(81)},{...fields,medium:{toString(){return 'social';}}}]) assert.equal(cleanCampaign(raw),null);
const link=campaignLink('/product/fixture-suit?ref=AZP1234567890',fields);
assert.equal(new URL(link).searchParams.get('ref'),'AZP1234567890');
assert.deepEqual(campaignFromUrl(new URL(link)),cleanCampaign(fields));
for(const url of ['https://attacker.example/product/suit','//attacker.example','javascript:alert(1)','/admin','/checkout'])assert.throws(()=>campaignLink(url,fields));

const now=Date.parse('2026-10-23T12:00:00Z'),date='2026-10-23T08:00:00Z',marketing=cleanCampaign(fields);
const orders=[{createdAt:date,total:1000,status:'placed',marketing},{createdAt:date,total:2000,status:'delivered',marketing},{createdAt:date,total:3000,status:'cancelled',marketing},{createdAt:date,total:4000,status:'returned',marketing},{createdAt:date,total:700,status:'placed'},{createdAt:'2026-10-24T01:00:00Z',total:999,status:'placed',marketing},{createdAt:'2026-09-01T00:00:00Z',total:999,status:'placed',marketing}];
const report=campaignReport(orders,7,now);
assert.equal(report.untaggedOrders,1);assert.equal(report.campaigns.length,1);
assert.deepEqual(report.campaigns[0],{...marketing,orders:4,activeOrders:2,delivered:1,cancelled:2,orderValue:3000,deliveredValue:2000});
assert(!JSON.stringify(report).includes('customer'));

const feature=fs.readFileSync(new URL('../public/js/features/marketing.js',import.meta.url),'utf8');
const state={},storage=new Map();
const capture=new Function('state','localStorage','CAMPAIGN_DAYS','campaignFromUrl','cleanCampaign',feature.slice(feature.indexOf('const privatePage'),feature.indexOf('async function copy'))+'\nreturn capture;')(state,{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},CAMPAIGN_DAYS,campaignFromUrl,cleanCampaign);
capture(new URL(link));const saved=storage.get('az_campaign');assert.deepEqual(state.marketing,marketing);
capture(new URL('https://aarzu.store/checkout'));assert.equal(storage.get('az_campaign'),saved,'direct navigation must not extend attribution');
capture(new URL('https://admin.aarzu.store/admin?utm_source=youtube&utm_medium=creator&utm_campaign=bad'));assert.equal(state.marketing,null);assert.equal(storage.get('az_campaign'),saved);
storage.set('az_campaign',JSON.stringify({labels:marketing,expires:Date.now()-1}));capture(new URL('https://aarzu.store/'));assert.equal(state.marketing,null);assert(!storage.has('az_campaign'));
const blocked=new Function('state','localStorage','CAMPAIGN_DAYS','campaignFromUrl','cleanCampaign',feature.slice(feature.indexOf('const privatePage'),feature.indexOf('async function copy'))+'\nreturn capture;')(state,{setItem(){throw Error('Blocked');}},CAMPAIGN_DAYS,campaignFromUrl,cleanCampaign);
blocked(new URL(link));assert.deepEqual(state.marketing,marketing);

const index=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../public/js/app.js',import.meta.url),'utf8');
const choose=index.match(/document\.documentElement\.dataset\.workspace = [^;]+;/)[0];
for(const [href,kind] of [['https://aarzu.store/partnerships','creators'],['https://aarzu.store/promotions/','creators'],['https://admin.aarzu.store/','admin'],['https://aarzu.store/admin/invoice/AZ123','admin'],['https://aarzu.store/shop','']]){const document={documentElement:{dataset:{}}};new Function('location','document',choose)(new URL(href),document);assert.equal(document.documentElement.dataset.workspace,kind);}
assert(index.indexOf('dataset.workspace')<index.indexOf('<body>'));
assert(app.indexOf('dataset.workspace =')<app.indexOf('const res = await (match'));
console.log('PASS campaign URLs, label validation, 30-day attribution, blocked storage, cancelled/returned totals and workspace layout before loading');
