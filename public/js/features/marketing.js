import { $, $$, esc, rs, state, toast, registerAdminTab, registerRouteHook } from '../core.js';
import { CAMPAIGN_DAYS, campaignFromUrl, campaignLink, cleanCampaign } from '../marketing.js';

const privatePage = url => /^admin\./i.test(url.hostname) || /^\/(?:admin|partnerships|promotions)(?:\/|$)/.test(url.pathname);
function capture(url) {
  state.marketing = null;
  if (privatePage(url)) return;
  try {
    const incoming = campaignFromUrl(url);
    if (incoming) localStorage.setItem('az_campaign', JSON.stringify({labels:incoming,expires:Date.now()+CAMPAIGN_DAYS*86400000}));
    const saved = JSON.parse(localStorage.getItem('az_campaign'));
    if (saved?.expires > Date.now()) state.marketing = cleanCampaign(saved.labels);
    else localStorage.removeItem('az_campaign');
    if (incoming) state.marketing = incoming;
  } catch { state.marketing = campaignFromUrl(url); }
}
async function copy(text, input) {
  try { await navigator.clipboard.writeText(text); toast('Copied. Ready to share.'); }
  catch { input?.focus(); input?.select(); toast('Select and copy the highlighted text.'); }
}
const label = (name,title,extra='') => `<label class="mk-field"><span>${title}</span><input name="${name}" maxlength="80" ${extra}></label>`;
const download = (name, text) => {
  const link=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function reportHTML(data) {
  const all=data.campaigns, sum=key=>all.reduce((n,x)=>n+x[key],0);
  return `<div class="mk-metrics">${[[sum('orders'),'Attributed orders'],[sum('delivered'),'Delivered orders'],[rs(sum('deliveredValue')),'Delivered order value'],[data.untaggedOrders,'Orders without campaign labels']].map(([v,t])=>`<div><strong>${v}</strong><span>${t}</span></div>`).join('')}</div><p class="mk-note">Orders are grouped by the most recent tagged link in the shopper’s browser, remembered for up to 30 days. Earlier orders are not backfilled. Delivered order value includes delivery and add-ons; it is not collected cash, profit or creator commission.</p>${all.length?`<div class="mk-table"><table><thead><tr><th>Campaign / creative</th><th>Source / medium</th><th>Orders</th><th>Delivered</th><th>Cancelled / returned</th><th>Active order value</th></tr></thead><tbody>${all.map(c=>`<tr><td><b>${esc(c.campaign)}</b><small>${esc(c.content||'—')}</small></td><td>${esc(c.source)}<small>${esc(c.medium)}</small></td><td>${c.orders}</td><td>${c.delivered}</td><td>${c.cancelled}</td><td>${rs(c.orderValue)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="mk-empty"><h3>Your next campaign starts here.</h3><p>Create a link below and use it in a post, video description or creator invitation. Orders placed after shoppers follow it will appear here.</p></div>'}`;
}
async function adminMarketing(el, call) {
  el.classList.add('mk');
  const products=state.products.filter(p=>!p.unlisted&&p.gender==='women'&&Object.values(p.stock||{}).some(n=>n>0));
  el.innerHTML=`<section class="mk-intro"><div><span class="ad-overline">Your next customer is out there</span><h2>Make every campaign count.</h2><p>Create a link, share the collection and see which campaigns bring orders.</p></div><a class="btn ghost sm" href="https://aarzu.store/partnerships" target="_blank" rel="noopener">Creator signup page ↗</a></section><section class="mk-card"><div class="mk-heading"><h3>Campaign performance</h3><label class="mk-period">Period<select data-mk-period><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select></label><button class="btn ghost sm" data-mk-refresh>Refresh</button><button class="btn ghost sm" data-mk-export disabled>Export CSV</button></div><div data-mk-report role="status">Loading campaign performance…</div></section><div class="mk-grid"><section class="mk-card"><span class="ad-overline">01 / Build your link</span><h3>A clear destination. A traceable link.</h3><form data-mk-form><label class="mk-field"><span>Where should shoppers land?</span><select name="destination"><option value="/shop?gender=women">Women’s collection</option><option value="/">Store homepage</option>${products.map(p=>`<option value="/product/${esc(p.slug)}">${esc(p.title)} · ${rs(p.price)}</option>`).join('')}</select></label><div class="mk-fields">${label('source','Source','value="instagram" required placeholder="instagram, youtube, whatsapp"')}${label('medium','Medium','value="social" required placeholder="social, creator, email, cpc"')}${label('campaign','Campaign name','value="aarzu-new-collection" required')}${label('content','Creative label (optional)','placeholder="reel-01"')}</div><p class="mk-note">Use short labels. Never put a customer’s name, phone, email or bank details in a campaign link.</p><button class="btn rani" type="submit">Generate campaign link</button><p class="mk-error" data-mk-error role="alert" hidden></p></form></section><section class="mk-card mk-output"><span class="ad-overline">02 / Ready to share</span><h3>Your campaign kit</h3><label class="mk-field"><span>Campaign link</span><textarea data-mk-link readonly rows="4" aria-label="Generated campaign link"></textarea></label><button class="btn ghost sm" data-mk-copy="link">Copy link</button><label class="mk-field"><span>Suggested caption · edit before posting</span><textarea data-mk-caption rows="6" aria-label="Suggested campaign caption"></textarea></label><div class="mk-actions"><button class="btn ghost sm" data-mk-copy="caption">Copy caption</button><a class="btn ghost sm" data-mk-whatsapp target="_blank" rel="noopener noreferrer">Share on WhatsApp ↗</a></div><p class="mk-note">Sharing opens WhatsApp with your message ready. You choose the recipients and send it. Creating a link does not publish a post or start paid ads.</p></section></div><section class="mk-card mk-checklist"><div><span class="ad-overline">A thoughtful launch</span><h3>Give people a reason to visit.</h3></div><ol><li><b>Show the actual suit.</b><span>Use the product’s real pictures, current price and fabric details.</span></li><li><b>Share the right link.</b><span>Use one campaign name and a different creative label for each post.</span></li><li><b>Invite creators.</b><span>40% of eligible net product sales, 10% off for viewers, no upfront sponsorship fee. Creators must disclose the partnership.</span></li><li><b>Follow the order through.</b><span>Review delivery and returns before judging a campaign’s results.</span></li></ol><a href="https://aarzu.store/partnerships" target="_blank" rel="noopener">Open creator programme and full terms ↗</a></section>`;
  const form=$('[data-mk-form]',el),link=$('[data-mk-link]',el),caption=$('[data-mk-caption]',el),err=$('[data-mk-error]',el);
  const generate=()=>{try{const values=Object.fromEntries(new FormData(form)),url=campaignLink(values.destination,values),p=products.find(p=>values.destination==='/product/'+p.slug);link.value=url;caption.value=(p?`${p.title} — ${rs(p.price)}\n\n`:'Discover the women’s collection at Aarzu.\n\n')+'Explore the current collection, check fabric details and availability, and order online. Cash on delivery is available across Pakistan, subject to checkout eligibility.\n\nShop here: '+url;$('[data-mk-whatsapp]',el).href='https://wa.me/?text='+encodeURIComponent(caption.value);err.hidden=true;}catch(e){err.textContent=e.message;err.hidden=false;}};
  form.onsubmit=e=>{e.preventDefault();generate();};
  $$('[data-mk-copy]',el).forEach(b=>b.onclick=()=>{const input=b.dataset.mkCopy==='link'?link:caption;void copy(input.value,input);});
  caption.oninput=()=>{$('[data-mk-whatsapp]',el).href='https://wa.me/?text='+encodeURIComponent(caption.value);};
  let report=null,busy=false;
  const load=async()=>{if(busy)return;busy=true;const target=$('[data-mk-report]',el),refresh=$('[data-mk-refresh]',el),period=$('[data-mk-period]',el),exportButton=$('[data-mk-export]',el);refresh.disabled=true;period.disabled=true;exportButton.disabled=true;try{const next=await call('/api/admin/marketing?days='+period.value);if(!el.isConnected)return;report=next;target.innerHTML=reportHTML(report);exportButton.disabled=!report.campaigns.length;}catch(e){target.textContent=e.message;}finally{refresh.disabled=false;period.disabled=false;busy=false;}};
  $('[data-mk-refresh]',el).onclick=load;$('[data-mk-period]',el).onchange=load;
  $('[data-mk-export]',el).onclick=()=>{if(!report)return;const columns=['source','medium','campaign','content','orders','activeOrders','delivered','cancelled','orderValue','deliveredValue'];download('aarzu-campaigns.csv','\uFEFF'+[columns,...report.campaigns.map(c=>columns.map(k=>c[k]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n'));};
  generate();await load();
}
export function init() {
  capture(new URL(location.href));
  registerRouteHook(capture);
  registerAdminTab({key:'marketing',label:'Marketing',render:adminMarketing});
}
