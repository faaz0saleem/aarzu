import { campaignReport, cleanCampaign } from '../../public/js/marketing.js';

export function decorateOrder(order, ctx, req, body) {
  const labels = cleanCampaign(body?.marketing);
  if (labels) order.marketing = labels;
}

export function handle(req, res, url, ctx) {
  if (url.pathname !== '/api/admin/marketing' || req.method !== 'GET') return false;
  const reply = (status, data) => ctx.send(req,res,status,data,'application/json; charset=utf-8',{'Cache-Control':'no-store','X-Robots-Tag':'noindex'});
  if (!ctx.adminOk(req)) { reply(401,{error:'Please sign in to admin.'}); return true; }
  const days = [7,30,90].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
  reply(200,campaignReport(ctx.orders(),days));
  return true;
}
