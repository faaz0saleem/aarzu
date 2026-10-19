// Back-in-stock alerts and abandoned-bag recovery · واپسی
//   POST /api/alerts/restock               { id, size, phone, email? } -> 201 (200 + already when on the list)
//   POST /api/alerts/checkout-draft        { sid, name, phone, city, items: [{ id?, title, size, qty }], total }
//                                          upsert by sid; also sets the az_draft cookie so onOrder can match it
//   GET  /api/admin/alerts/restock         requests grouped by product + size (admin)
//   POST /api/admin/alerts/restock/<id>    { contacted: boolean } (admin)
//   GET  /api/admin/alerts/drafts          abandoned bags (30 min+ quiet, not ordered) + recovered count (admin)
//   POST /api/admin/alerts/drafts/<sid>    { contacted: boolean } (admin)
//   onStock      a size goes from 0 to in stock: email everyone waiting who left an email,
//                mark the requests notified, one Telegram summary for the owner. Never throws.
//   onOrder      drafts with the order's phone (or this browser's draft cookie) -> recovered
//   adminSummary { restockWaiting, abandonedBags }
// Data: runtime "restock" and "checkout-drafts". Drafts are dropped after 30 days.
import crypto from "node:crypto";
import { sendMail, sendTelegram } from "../mailer.mjs";

const RESTOCK = "restock";
const DRAFTS = "checkout-drafts";
const COOKIE = "az_draft";
const DAY = 864e5;
const DRAFT_DAYS = 30;
const ABANDONED_AFTER = 30 * 60e3; // a bag counts as abandoned after 30 quiet minutes
const KEEP_DONE = 180 * DAY; // notified requests are kept this long for the admin
const MAX_DRAFTS = 5000;
const MAX_REQUESTS = 20000;

const SITE = () => (process.env.SITE_URL || "").replace(/\/$/, "");
const now = () => new Date().toISOString();
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ipOf = (req) => (process.env.TRUST_PROXY === "1" && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket?.remoteAddress || "?";
const originOf = (req) => SITE() || `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${req.headers.host || "localhost"}`;
const sizeText = (r) => (r.oneSize ? "" : ` (${r.size})`);

// ------------------------------------------------------------------ small sliding-window limiter
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now();
  const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
  list.push(t);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
  return list.length > max;
}

// ------------------------------------------------------------------ storage
function pruneRequests(list) {
  const cut = Date.now() - KEEP_DONE;
  const kept = list.filter((r) => r.status === "pending" || Date.parse(r.notifiedAt || r.at) > cut);
  return kept.length > MAX_REQUESTS ? kept.slice(-MAX_REQUESTS) : kept;
}
function drafts(ctx) {
  const list = ctx.db.get(DRAFTS, []);
  const cut = Date.now() - DRAFT_DAYS * DAY;
  const kept = list.filter((d) => Date.parse(d.updatedAt || d.createdAt) > cut);
  if (kept.length !== list.length) ctx.db.set(DRAFTS, kept);
  return kept;
}

const reply = (ctx, req, res, status, body, extra = {}) => { ctx.send(req, res, status, body, "application/json; charset=utf-8", { "Cache-Control": "no-store", ...extra }); return true; };

// ------------------------------------------------------------------ HTTP
export async function handle(req, res, url, ctx) {
  const p = url.pathname;
  if (p === "/api/alerts/restock" && req.method === "POST") return restockRequest(req, res, ctx);
  if (p === "/api/alerts/checkout-draft" && req.method === "POST") return saveDraft(req, res, ctx);
  if (!/^\/api\/admin\/alerts(\/|$)/.test(p)) return false;
  if (!ctx.adminOk(req)) return reply(ctx, req, res, 401, { error: "Wrong password" });

  if (p === "/api/admin/alerts/restock" && req.method === "GET") return reply(ctx, req, res, 200, { site: originOf(req), groups: restockGroups(ctx) });
  const rq = p.match(/^\/api\/admin\/alerts\/restock\/([a-f0-9]{8,32})$/);
  if (rq && req.method === "POST") {
    const b = await ctx.readBody(req, 2000);
    const list = ctx.db.get(RESTOCK, []);
    const r = list.find((x) => x.id === rq[1]);
    if (!r) return reply(ctx, req, res, 404, { error: "No such request" });
    r.contactedAt = b.contacted ? now() : null;
    ctx.db.set(RESTOCK, list);
    return reply(ctx, req, res, 200, r);
  }

  if (p === "/api/admin/alerts/drafts" && req.method === "GET") {
    const list = drafts(ctx);
    const cut = Date.now() - ABANDONED_AFTER;
    const quiet = (d) => Date.parse(d.updatedAt) < cut;
    const recovered = list.filter((d) => d.recovered);
    return reply(ctx, req, res, 200, {
      site: originOf(req),
      abandoned: list.filter((d) => !d.recovered && quiet(d)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
      inProgress: list.filter((d) => !d.recovered && !quiet(d)).length,
      recovered: recovered.length,
      recoveredValue: recovered.reduce((s, d) => s + (d.total || 0), 0),
      days: DRAFT_DAYS,
    });
  }
  const dr = p.match(/^\/api\/admin\/alerts\/drafts\/([a-z0-9]{6,64})$/i);
  if (dr && req.method === "POST") {
    const b = await ctx.readBody(req, 2000);
    const list = drafts(ctx);
    const d = list.find((x) => x.sid === dr[1]);
    if (!d) return reply(ctx, req, res, 404, { error: "No such bag" });
    d.contactedAt = b.contacted ? now() : null;
    ctx.db.set(DRAFTS, list);
    return reply(ctx, req, res, 200, d);
  }
  return reply(ctx, req, res, 404, { error: "Not found" });
}

// ------------------------------------------------------------------ back in stock: requests
async function restockRequest(req, res, ctx) {
  const b = await ctx.readBody(req, 4000);
  const p = ctx.catalog.byId[ctx.clean(b.id, 40)];
  if (!p || p.category === "giftcard") return reply(ctx, req, res, 404, { error: "We couldn't find that piece." });
  const size = String(b.size ?? "").trim();
  if (!p.sizes.includes(size)) return reply(ctx, req, res, 422, { error: "Please choose a size.", errors: { size: "Please choose a size." } });
  const phone = ctx.normPhone(b.phone);
  const email = String(b.email ?? "").trim().toLowerCase();
  const errors = {};
  if (!phone) errors.phone = "Enter a valid Pakistani mobile number, e.g. 0300 1234567.";
  if (email && (!ctx.validEmail(email) || email.length > 120)) errors.email = "That email doesn't look right.";
  if (Object.keys(errors).length) return reply(ctx, req, res, 422, { error: Object.values(errors)[0], errors });
  if (limited(`rs:ip:${ipOf(req)}`, 12, 10 * 60e3)) return reply(ctx, req, res, 429, { error: "Too many requests. Please try again in a few minutes." });

  const left = ctx.catalog.stockOf(p)[size] ?? 0;
  if (left > 0) return reply(ctx, req, res, 409, { error: `Good news: ${p.sizes.length > 1 ? size : "it"} is in stock right now, so you can order it today.`, inStock: left });

  const list = ctx.db.get(RESTOCK, []);
  const same = list.find((r) => r.productId === p.id && r.size === size && r.phone === phone && r.status === "pending");
  if (same) {
    if (email && same.email !== email) { same.email = email; ctx.db.set(RESTOCK, list); }
    return reply(ctx, req, res, 200, { ok: true, already: true });
  }
  if (list.filter((r) => r.phone === phone && r.status === "pending").length >= 20) return reply(ctx, req, res, 429, { error: "This number is already waiting for 20 pieces. We'll message you as they come back." });
  list.push({
    id: crypto.randomBytes(6).toString("hex"),
    productId: p.id, size, oneSize: p.sizes.length === 1, title: p.title, slug: p.slug,
    phone, email, at: now(), status: "pending", notifiedAt: null, emailedAt: null, contactedAt: null,
  });
  ctx.db.set(RESTOCK, pruneRequests(list));
  return reply(ctx, req, res, 201, { ok: true });
}

function restockGroups(ctx) {
  const groups = new Map();
  for (const r of ctx.db.get(RESTOCK, [])) {
    const key = `${r.productId}|${r.size}`;
    let g = groups.get(key);
    if (!g) {
      const p = ctx.catalog.byId[r.productId];
      g = { key, productId: r.productId, size: r.size, oneSize: !!r.oneSize, title: p?.title || r.title, slug: p?.slug || r.slug, image: p?.images?.[0] || null, inStock: p ? ctx.catalog.stockOf(p)[r.size] ?? 0 : null, people: [] };
      groups.set(key, g);
    }
    const { id, phone, email, at, status, notifiedAt, emailedAt, contactedAt } = r;
    g.people.push({ id, phone, email, at, status, notifiedAt, emailedAt, contactedAt });
  }
  const out = [...groups.values()].map((g) => {
    g.people.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    g.waiting = g.people.filter((x) => x.status === "pending").length;
    g.toContact = g.people.filter((x) => !x.contactedAt && (x.status === "notified" || g.inStock > 0)).length;
    g.contacted = g.people.filter((x) => x.contactedAt).length;
    g.latest = g.people[0]?.at;
    return g;
  });
  return out.sort((a, b) => (b.toContact > 0) - (a.toContact > 0) || b.waiting - a.waiting || Date.parse(b.latest) - Date.parse(a.latest));
}

// ------------------------------------------------------------------ back in stock: alerts
export function onStock(id, size, qty, prevQty, ctx) {
  try {
    if (!(Number(prevQty) <= 0 && Number(qty) > 0)) return;
    const list = ctx.db.get(RESTOCK, []);
    const due = list.filter((r) => r.productId === id && r.size === String(size) && r.status === "pending");
    if (!due.length) return;
    const at = now();
    for (const r of due) { r.status = "notified"; r.notifiedAt = at; }
    ctx.db.set(RESTOCK, list);
    announce(id, due, ctx).catch((e) => console.warn(`[alerts] ${e.message}`));
  } catch (e) {
    console.warn(`[alerts] onStock: ${e.message}`);
  }
}

function shell(store, title, inner) {
  const logo = SITE() ? `<img src="${SITE()}/brand/aarzu-logo.png" alt="Aarzu" width="180" style="display:block;margin:0 auto 6px">` : `<div style="font:600 28px Georgia,serif;letter-spacing:8px;color:#1E1324">AARZU</div>`;
  return `<!doctype html><html><body style="margin:0;background:#FFF8EF;font-family:Helvetica,Arial,sans-serif;color:#1E1324">
  <div style="height:6px;background:linear-gradient(90deg,#D6246E,#F26B1D,#F2A900,#0FA3A3,#1C2A6B)"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
  <tr><td style="padding:28px 28px 8px;text-align:center">${logo}<div style="font-size:12px;letter-spacing:3px;color:#A3164F;text-transform:uppercase">${h(title)}</div></td></tr>
  <tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${inner}</td></tr>
  <tr><td style="padding:18px 28px;background:#1E1324;color:#F7E7C1;font-size:12px;text-align:center">
  ${h(store.name)} · WhatsApp +${h(store.contact?.whatsapp)} · ${h(store.contact?.email)}<br>آپ کی آرزو، ہماری ذمہ داری</td></tr>
  </table></td></tr></table></body></html>`;
}

function restockEmail(store, p, r) {
  const title = p?.title || r.title;
  const slug = p?.slug || r.slug;
  const link = SITE() && slug ? `${SITE()}/product/${encodeURIComponent(slug)}` : "";
  const im = SITE() && p?.images?.[0] ? (/^https?:/.test(p.images[0]) ? `${SITE()}/img?u=${encodeURIComponent(p.images[0])}` : SITE() + p.images[0]) : "";
  const asked = new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const inner = `<p>Assalam o Alaikum,</p>
    <p>Good news! <b>${h(title)}</b>${r.oneSize ? "" : ` in size <b>${h(r.size)}</b>`} is back in stock at Aarzu.</p>
    ${im ? `<p style="text-align:center;margin:18px 0"><img src="${h(im)}" alt="${h(title)}" width="220" style="display:inline-block;width:220px;max-width:100%;border-radius:14px"></p>` : ""}
    <p>Pieces can sell out again, so if you'd like it, it's best to order soon.</p>
    ${link ? `<p style="text-align:center;margin:22px 0"><a href="${h(link)}" style="background:#D6246E;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600">Shop it now</a></p>` : ""}
    <p style="color:#8A7C8E;font-size:13px">You asked us to tell you on ${h(asked)}. This is a one-time message. Questions? WhatsApp us on +${h(store.contact?.whatsapp)}.</p>`;
  return { subject: `Back in stock: ${title}${sizeText(r)}`, html: shell(store, "Back in stock", inner) };
}

async function announce(id, due, ctx) {
  const store = ctx.store();
  const p = ctx.catalog.byId[id];
  const first = due[0];
  const title = p?.title || first.title;
  const tried = new Set(), ok = new Set(); // one email per address, even if it asked from two numbers
  for (const r of due) {
    if (!r.email || tried.has(r.email)) continue;
    tried.add(r.email);
    try {
      const { subject, html } = restockEmail(store, p, r);
      const out = await sendMail({ to: r.email, subject, html });
      if (out?.sent) ok.add(r.email);
    } catch (e) {
      console.warn(`[alerts] restock email: ${e.message}`);
    }
  }
  const ids = new Set(due.filter((r) => ok.has(r.email)).map((r) => r.id));
  const emailed = [...ids];
  if (ids.size) {
    const list = ctx.db.get(RESTOCK, []);
    const at = now();
    for (const r of list) if (ids.has(r.id)) r.emailedAt = at;
    ctx.db.set(RESTOCK, list);
  }
  const n = due.length;
  const rest = n - emailed.length;
  try {
    await sendTelegram(`🔔 <b>Back in stock</b>: ${h(title)}${h(sizeText(first))}\n${n} ${n === 1 ? "person" : "people"} asked to hear about it${emailed.length ? `, ${emailed.length} emailed` : ""}.${rest ? `\nWhatsApp ${rest === n ? "them" : `the other ${rest}`} from Admin → Restock requests.` : ""}`);
  } catch (e) {
    console.warn(`[alerts] telegram: ${e.message}`);
  }
  console.log(`[alerts] back in stock ${id}${sizeText(first)}: ${n} waiting, ${emailed.length} emailed`);
}

// ------------------------------------------------------------------ abandoned bags
function draftCookie(req, sid) {
  const secure = req.socket?.encrypted || /^https/i.test(String(req.headers["x-forwarded-proto"] || "")) ? "; Secure" : "";
  return `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/api; Max-Age=${DRAFT_DAYS * 86400}${secure}`;
}

async function saveDraft(req, res, ctx) {
  const b = await ctx.readBody(req, 20000);
  const sid = String(b.sid ?? "");
  if (!/^[a-z0-9]{6,64}$/i.test(sid)) return reply(ctx, req, res, 400, { error: "Missing session." });
  const name = ctx.clean(b.name, 80);
  const phone = ctx.normPhone(b.phone);
  if (name.length < 2 || !phone) return reply(ctx, req, res, 422, { error: "A name and a valid mobile number are needed." });
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => {
    const p = ctx.catalog.byId[ctx.clean(i?.id, 40)];
    return { id: p?.id || null, slug: p?.slug || null, title: p?.title || ctx.clean(i?.title, 120), size: ctx.clean(i?.size, 40), qty: Math.max(1, Math.min(99, Math.round(Number(i?.qty)) || 1)) };
  }).filter((i) => i.title);
  if (!items.length) return reply(ctx, req, res, 400, { error: "Your bag is empty." });
  if (limited(`dr:ip:${ipOf(req)}`, 60, 10 * 60e3) || limited(`dr:sid:${sid}`, 30, 10 * 60e3)) return reply(ctx, req, res, 429, { error: "Too many saves. Please try again shortly." });

  const list = drafts(ctx);
  let d = list.find((x) => x.sid === sid);
  // a save that raced the order which just recovered this bag: ignore it
  if (d?.recovered && Date.now() - Date.parse(d.recoveredAt) < 10 * 60e3) return reply(ctx, req, res, 200, { ok: true });
  const at = now();
  if (!d) { d = { sid, createdAt: at }; list.push(d); }
  else if (d.recovered) Object.assign(d, { createdAt: at, recoveredAt: null, orderId: null, contactedAt: null }); // a new bag
  Object.assign(d, {
    name, phone, city: ctx.clean(b.city, 60), items,
    total: Math.max(0, Math.min(10_000_000, Math.round(Number(b.total) || 0))),
    updatedAt: at, recovered: false, contactedAt: d.contactedAt || null,
  });
  if (list.length > MAX_DRAFTS) list.splice(0, list.length - MAX_DRAFTS);
  ctx.db.set(DRAFTS, list);
  return reply(ctx, req, res, 200, { ok: true }, { "Set-Cookie": draftCookie(req, sid) });
}

export function onOrder(order, ctx, req) {
  try {
    const list = drafts(ctx);
    let sid = null;
    try { sid = req ? ctx.parseCookies(req)[COOKIE] || null : null; } catch {}
    const phone = order?.customer?.phone;
    const at = now();
    let changed = false;
    for (const d of list) {
      if (d.recovered || !((phone && d.phone === phone) || (sid && d.sid === sid))) continue;
      Object.assign(d, { recovered: true, recoveredAt: at, orderId: order.id });
      changed = true;
    }
    if (changed) ctx.db.set(DRAFTS, list);
  } catch (e) {
    console.warn(`[alerts] onOrder: ${e.message}`);
  }
}

export function adminSummary(ctx) {
  const cut = Date.now() - ABANDONED_AFTER;
  return {
    restockWaiting: ctx.db.get(RESTOCK, []).filter((r) => r.status === "pending").length,
    abandonedBags: drafts(ctx).filter((d) => !d.recovered && Date.parse(d.updatedAt) < cut).length,
  };
}
