import { visitorStore } from '../visitors-store.mjs';

export async function handle(req, res, url, ctx) {
  const publicRoute = url.pathname === '/api/visitors', adminRoute = url.pathname === '/api/admin/visitors';
  if (!publicRoute && !adminRoute) return false;
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, data) => { ctx.json(req, res, status, data); return true; };
  if (adminRoute) {
    if (!ctx.adminOk(req)) return reply(401, { error: 'Wrong password' });
    if (req.method !== 'GET') return reply(405, { error: 'Use GET for visitor counts.' });
    try { return reply(200, visitorStore(ctx.db.dir).summary()); }
    catch { return reply(503, { error: 'Visitor counts are temporarily unavailable.' }); }
  }
  if (req.method !== 'POST') return reply(405, { error: 'Use POST for visitor activity.' });
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return reply(403, { error: 'Please submit this request from the store.' }); }
    catch { return reply(403, { error: 'Invalid origin.' }); }
  }
  if (/bot|crawler|spider|headless|lighthouse|facebookexternalhit|preview/i.test(req.headers['user-agent'] || '')) return reply(202, { ok: false, registered: false });
  let body;
  try { body = await ctx.readBody(req, 1024); } catch { return reply(400, { error: 'Invalid visitor activity.' }); }
  try { const ok = visitorStore(ctx.db.dir).touch(body); return reply(ok ? 200 : 202, { ok, registered: ok }); }
  catch { return reply(202, { ok: false, registered: false }); }
}
