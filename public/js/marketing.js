// Shared, bounded campaign labels. No customer information belongs in a campaign URL.
export const CAMPAIGN_DAYS = 30;
export function cleanCampaign(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    const value = typeof raw[key] === 'string' ? raw[key].trim().toLowerCase().replace(/\s+/g, '-') : '';
    if (value && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) out[key] = value;
  }
  return out.source && out.medium && out.campaign ? out : null;
}
export function campaignFromUrl(url) {
  return cleanCampaign(Object.fromEntries(['source','medium','campaign','content'].map(k => [k, url.searchParams.get('utm_' + k)])));
}
export function campaignLink(destination, labels) {
  const c = cleanCampaign(labels);
  if (!c) throw new Error('Use letters, numbers, spaces, dots, dashes or underscores for campaign labels (up to 80 characters).');
  const url = new URL(destination, 'https://aarzu.store');
  if (url.origin !== 'https://aarzu.store' || !/^\/(?:$|shop\/?$|product\/[\w-]+\/?$)/.test(url.pathname)) throw new Error('Choose an Aarzu collection or product.');
  url.hash = '';
  for (const key of ['source','medium','campaign','content']) {
    url.searchParams.delete('utm_' + key);
    if (c[key]) url.searchParams.set('utm_' + key, c[key]);
  }
  return url.href;
}
export function campaignReport(orders, days = 30, now = Date.now()) {
  const groups = new Map(), day = 86400000, pkt = 18000000;
  const today = Math.floor((now + pkt) / day), cutoff = today - days + 1;
  let untagged = 0;
  for (const o of orders) {
    const at = Date.parse(o.createdAt);
    if (!Number.isFinite(at) || at > now || Math.floor((at + pkt) / day) < cutoff) continue;
    const c = cleanCampaign(o.marketing);
    if (!c) { untagged++; continue; }
    const key = JSON.stringify([c.source,c.medium,c.campaign,c.content || '']);
    if (!groups.has(key)) groups.set(key, {...c, orders:0, activeOrders:0, delivered:0, cancelled:0, orderValue:0, deliveredValue:0});
    const g = groups.get(key), value = Math.max(0, Number(o.total) || 0);
    g.orders++;
    if (['cancelled','returned'].includes(o.status)) { g.cancelled++; continue; }
    g.activeOrders++; g.orderValue += value;
    if (o.status === 'delivered') { g.delivered++; g.deliveredValue += value; }
  }
  return {days, generatedAt:new Date(now).toISOString(), untaggedOrders:untagged, campaigns:[...groups.values()].sort((a,b)=>b.orders-a.orders || a.campaign.localeCompare(b.campaign))};
}
