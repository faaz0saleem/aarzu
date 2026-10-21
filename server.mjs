// Aarzu storefront server: static site + JSON API. Zero dependencies.
//   npm start            -> http://localhost:3000
//   PORT=8080 npm start  -> custom port
import "./lib/env.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./lib/db.mjs";
import { Catalog } from "./lib/catalog.mjs";
import { serveImage } from "./lib/imgproxy.mjs";
import { priceCart } from "./public/js/pricing.js";
import { scheduleBackups } from "./lib/backup.mjs";
import { adminPasswordConfigured, adminPasswordMatches } from "./lib/admin-auth.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_CREDENTIAL_FILE = path.join(DATA, "admin-auth.json");
const PRODUCTION = process.env.NODE_ENV === "production";
if (PRODUCTION && !adminPasswordConfigured(ADMIN_PASSWORD, ADMIN_CREDENTIAL_FILE)) {
  console.error("Configure ADMIN_PASSWORD (10+ characters) in .env or upload data/admin-auth.json before starting in production");
  process.exit(1);
}
const STATUSES = ["placed", "confirmed", "dispatched", "delivered", "cancelled", "returned"];
const RESTOCK = new Set(["cancelled", "returned"]);

const db = new JsonStore(process.env.RUNTIME_DIR || path.join(DATA, "runtime"));
const catalog = new Catalog(DATA, path.join(PUBLIC, "images", "originals", "photos"), db);
const store = () => JSON.parse(fs.readFileSync(path.join(DATA, "store.json"), "utf8"));

// Feature modules: every lib/routes/*.mjs may export
//   handle(req, res, url, ctx) -> true when it answered the request
//   resolveCoupon(code, ctx)   -> coupon object for codes it owns, else null
//   quoteCredit(body, ctx, req) -> { key, label, amount, commit(order, applied) } | null (throw to reject);
//                                 body.credits = [{ key, payload }] sent by the checkout
//   onOrder(order, ctx, req) / onOrderStatus(order, prevStatus, ctx)
//   onStock(id, size, qty, prevQty, ctx) after any stock change (admin edit, restock, sale)
//   adminSummary(ctx)          -> extra fields for the admin summary
// A module that fails to load is skipped so it can never take the store down.
const modules = [];
const ROUTES_DIR = path.join(ROOT, "lib", "routes");
for (const f of fs.existsSync(ROUTES_DIR) ? fs.readdirSync(ROUTES_DIR).filter((x) => x.endsWith(".mjs")).sort() : []) {
  try {
    modules.push({ name: f, ...(await import(new URL(`./lib/routes/${f}`, import.meta.url))) });
  } catch (e) {
    console.warn(`[modules] skipped ${f}: ${e.message}`);
  }
}
const parseCookies = (req) => Object.fromEntries(String(req.headers.cookie || "").split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf("="); return [decodeURIComponent(c.slice(0, i)), decodeURIComponent(c.slice(i + 1))]; }));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|application\/manifest)/;

// ------------------------------------------------------------------ helpers

function send(req, res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "SAMEORIGIN", ...extra };
  if (buf.length > 1024 && COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    buf = zlib.gzipSync(buf);
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
  }
  headers["Content-Length"] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : buf);
}

const json = (req, res, status, obj) => send(req, res, status, obj);
const fail = (req, res, status, error) => json(req, res, status, { error });

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

const clean = (s, max = 300) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, max);
const normPhone = (p) => {
  const d = String(p || "").replace(/\D/g, "");
  if (/^03\d{9}$/.test(d)) return "92" + d.slice(1);
  if (/^923\d{9}$/.test(d)) return d;
  return null;
};
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ""));

// Real client IP; behind a reverse proxy (Caddy/nginx) set TRUST_PROXY=1.
// A proxy on the same machine (Hostinger, Passenger, nginx) connects from loopback, so its header is trusted too.
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
const clientIp = (req) => ((process.env.TRUST_PROXY === "1" || LOOPBACK.test(req.socket.remoteAddress || "")) && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";

// Sliding-window limiter to stop order spam / fake-order floods.
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return list.length > max;
}

// Cash-on-delivery rules from store.json "cod": made-to-measure stitching and very
// large orders need an advance (bank transfer / wallet) so refusals can't cost the store.
function codBlocked(quote) {
  const rules = store().cod || {};
  if (rules.maxTotal && quote.total > rules.maxTotal) return `Cash on delivery is available up to Rs ${rules.maxTotal.toLocaleString("en-PK")}. Please pay by bank transfer or JazzCash/Easypaisa.`;
  if (rules.advanceForAddons?.length && quote.items.some((i) => (i.addons || []).some((a) => rules.advanceForAddons.includes(a.key)))) return "Stitched-to-measure orders need advance payment by bank transfer or JazzCash/Easypaisa.";
  return null;
}

// All stock changes go through here so modules (e.g. back-in-stock alerts) hear about them.
function setStock(id, size, qty) {
  const prev = catalog.stockOf(catalog.byId[id])[size] ?? 0;
  catalog.setStock(id, size, qty);
  for (const m of modules) if (m.onStock) try { m.onStock(id, size, qty, prev, ctx); } catch (e) { console.warn(`[${m.name}] onStock: ${e.message}`); }
}

function resolveCoupon(code, phone) {
  if (!code) return { coupon: null };
  let c = store().coupons[String(code).toUpperCase().trim()];
  if (!c) for (const m of modules) if (!c && m.resolveCoupon) try { c = m.resolveCoupon(String(code).toUpperCase().trim(), ctx); } catch {}
  if (!c) return { error: "That code isn't valid." };
  const offer = store().launchOffer;
  if (String(code).toUpperCase() === offer.code && Date.now() > Date.parse(offer.endsAt)) return { error: "This launch offer has ended." };
  if (c.firstOrderOnly && phone) {
    const p = normPhone(phone);
    if (p && db.get("orders", []).some((o) => o.customer.phone === p && o.status !== "cancelled")) return { error: "This code is for first orders only." };
  }
  return { coupon: { ...c, code: String(code).toUpperCase().trim() } };
}

function adminOk(req) {
  const key = `admin-auth:${clientIp(req)}`, now = Date.now();
  const failures = (hits.get(key) || []).filter(time => time > now - 300000);
  if (failures.length >= 10) return false;
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization.replace(/^Bearer\s+/i, "") : "";
  const fallback = typeof req.headers["x-aarzu-admin"] === "string" ? req.headers["x-aarzu-admin"] : "";
  if ([...new Set([authorization, fallback])].some(token => adminPasswordMatches(token, ADMIN_PASSWORD, ADMIN_CREDENTIAL_FILE))) {
    hits.delete(key);
    return true;
  }
  limited(key, 10, 300000);
  return false;
}

// Live viewers: real browser sessions currently on a product page.
const presence = new Map();
function touchPresence(productId, sid) {
  const now = Date.now();
  if (!presence.has(productId)) presence.set(productId, new Map());
  const m = presence.get(productId);
  if (sid) m.set(sid, now);
  for (const [k, t] of m) if (now - t > 40_000) m.delete(k);
  return Math.max(0, m.size - (sid ? 1 : 0));
}

// ------------------------------------------------------------------ API

async function api(req, res, url) {
  const p = url.pathname;
  const M = req.method;

  if (p === "/api/catalog" && M === "GET") return json(req, res, 200, { products: catalog.publicList(), media: catalog.media, store: publicStore() });

  if (p === "/api/coupon" && M === "POST") {
    const b = await readBody(req);
    const r = resolveCoupon(b.code, b.phone);
    return r.error ? fail(req, res, 400, r.error) : json(req, res, 200, r.coupon);
  }

  if (p === "/api/quote" && M === "POST") {
    const b = await readBody(req);
    const r = resolveCoupon(b.code, b.phone);
    let credits = [];
    try { credits = await collectCredits(b, req); } catch (e) { return fail(req, res, 422, e.message); }
    return json(req, res, 200, { ...priceCart(b.items || [], catalog.byId, store(), r.coupon, { credits }), couponError: r.error || null });
  }

  if (p === "/api/spin" && M === "POST") {
    const wheel = store().wheel;
    const total = wheel.reduce((s, w) => s + w.weight, 0);
    let x = crypto.randomInt(total);
    const index = wheel.findIndex((w) => (x -= w.weight) < 0);
    const b = await readBody(req).catch(() => ({}));
    if (b.contact) db.push("leads", { contact: clean(b.contact, 120), prize: wheel[index].code, at: new Date().toISOString() });
    return json(req, res, 200, { index, prize: wheel[index] });
  }

  if (p === "/api/orders" && M === "POST") {
    const b = await readBody(req);
    const c = b.customer || {};
    const phone = normPhone(c.phone);
    // Legacy "website" inputs can be autofilled with a country by real browsers.
    if (b.orderGuard) return fail(req, res, 400, "Something went wrong. Please try again.");
    const errors = {};
    if (clean(c.name).length < 2) errors.name = "Please enter your full name.";
    if (!phone) errors.phone = "Enter a valid Pakistani mobile number, e.g. 0300 1234567.";
    if (c.email && !validEmail(c.email)) errors.email = "That email doesn't look right.";
    if (!clean(c.city)) errors.city = "Choose your city.";
    if (clean(c.address, 500).length < 8) errors.address = "Please enter your full delivery address.";
    if (!["cod", "bank", "wallet"].includes(b.payment)) errors.payment = "Choose a payment method.";
    if (Object.keys(errors).length) return json(req, res, 422, { error: "Please check the highlighted fields.", errors });
    // Flood protection (counted only for complete orders; mobile networks share IPs, so the IP limit is generous)
    if (limited(`ip:${clientIp(req)}`, 30, 3600e3) || limited(`ph:${phone}`, 5, 86400e3)) return fail(req, res, 429, "Too many orders in a short time. Please WhatsApp us and we'll help.");

    const r = resolveCoupon(b.code, c.phone);
    if (r.error) return json(req, res, 422, { error: r.error, errors: { code: r.error } });
    let credits = [];
    try { credits = await collectCredits(b, req); } catch (e) { return json(req, res, 422, { error: e.message, errors: { credit: e.message } }); }
    const items = (Array.isArray(b.items) ? b.items : []).map((l) => ({ ...l, meta: cleanMeta(l.meta) }));
    const quote = priceCart(items, catalog.byId, store(), r.coupon, { credits });
    if (!quote.items.length) return fail(req, res, 400, "Your bag is empty.");
    const cod = b.payment === "cod" && codBlocked(quote);
    if (cod) return json(req, res, 422, { error: cod, errors: { payment: cod } });
    const need = {};
    for (const i of quote.items) need[`${i.id}|${i.size}`] = (need[`${i.id}|${i.size}`] || 0) + i.qty;
    for (const [k, qty] of Object.entries(need)) {
      const [id, size] = k.split("|");
      const left = catalog.stockOf(catalog.byId[id])[size] ?? 0;
      if (left < qty) return fail(req, res, 409, `Sorry, only ${left} left of ${catalog.byId[id].title} (${size}).`);
    }
    for (const [k, qty] of Object.entries(need)) {
      const [id, size] = k.split("|");
      setStock(id, size, catalog.stockOf(catalog.byId[id])[size] - qty);
    }
    const now = new Date().toISOString();
    const order = {
      id: "AZ" + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomInt(10, 99),
      createdAt: now,
      status: "placed",
      history: [{ status: "placed", at: now }],
      payment: b.payment,
      customer: { name: clean(c.name, 80), phone, email: clean(c.email, 120), city: clean(c.city, 60), address: clean(c.address, 500), notes: clean(c.notes, 500) },
      items: quote.items.map(({ id, title, image, size, qty, unit, line, addons, meta }) => ({ id, title, image, size, qty, unit, line, addons, meta })),
      subtotal: quote.subtotal,
      discounts: quote.discounts,
      shipping: quote.shipping,
      credits: quote.credits,
      total: quote.total,
      coupon: quote.coupon,
    };
    db.push("orders", order);
    for (const c of credits) {
      const applied = quote.credits.find((x) => x.key === c.key)?.amount || 0;
      try { await c.commit?.(order, applied); } catch (e) { console.warn(`[credit] ${c.key}: ${e.message}`); }
    }
    for (const m of modules) if (m.onOrder) try { await m.onOrder(order, ctx, req); } catch (e) { console.warn(`[${m.name}] onOrder: ${e.message}`); }
    console.log(`[order] ${order.id} · ${order.customer.city} · Rs ${order.total}`);
    return json(req, res, 201, { id: order.id, total: order.total, payment: order.payment });
  }

  const track = p.match(/^\/api\/orders\/([A-Z0-9]+)$/);
  if (track && M === "GET") {
    const phone = normPhone(url.searchParams.get("phone"));
    const o = db.get("orders", []).find((x) => x.id === track[1]);
    if (!o || o.customer.phone !== phone) return fail(req, res, 404, "We couldn't find an order with that number and phone.");
    const { customer, adminNote, ...rest } = o;
    const courier = (store().couriers || []).find((x) => x.name === o.courier);
    return json(req, res, 200, { ...rest, trackUrl: courier?.track ? courier.track.replace("{cn}", encodeURIComponent(o.tracking || "")) : null, customer: { name: customer.name, city: customer.city } });
  }

  if (p === "/api/activity" && M === "GET") {
    const since = Date.now() - 72 * 3600e3;
    const recent = db.get("orders", []).filter((o) => Date.parse(o.createdAt) > since && o.status !== "cancelled").slice(-12).reverse();
    return json(req, res, 200, recent.map((o) => ({ city: o.customer.city, title: o.items[0].title, image: o.items[0].image, slug: catalog.byId[o.items[0].id]?.slug, at: o.createdAt })));
  }

  if (p === "/api/presence" && M === "POST") {
    const b = await readBody(req);
    return json(req, res, 200, { others: touchPresence(clean(b.productId, 40), clean(b.sid, 64)) });
  }

  const rv = p.match(/^\/api\/reviews\/([\w-]+)$/);
  if (rv && M === "GET") return json(req, res, 200, db.get("reviews", []).filter((r) => r.productId === rv[1]).reverse());
  if (rv && M === "POST") {
    if (!catalog.byId[rv[1]]) return fail(req, res, 404, "Unknown product");
    const b = await readBody(req);
    const rating = Math.round(Number(b.rating));
    if (!(rating >= 1 && rating <= 5)) return fail(req, res, 400, "Choose a star rating.");
    if (clean(b.name).length < 2 || clean(b.text, 1000).length < 4) return fail(req, res, 400, "Please add your name and a few words.");
    const review = { productId: rv[1], name: clean(b.name, 60), city: clean(b.city, 60), rating, text: clean(b.text, 1000), at: new Date().toISOString() };
    db.push("reviews", review);
    return json(req, res, 201, review);
  }

  if ((p === "/api/waitlist" || p === "/api/newsletter") && M === "POST") {
    const b = await readBody(req);
    const contact = clean(b.contact, 120);
    if (!validEmail(contact) && !normPhone(contact)) return fail(req, res, 400, "Enter an email or a mobile number.");
    const name = p.endsWith("waitlist") ? "waitlist" : "newsletter";
    const list = db.get(name, []);
    const existing = list.findIndex((x) => x.contact.toLowerCase() === contact.toLowerCase());
    if (existing >= 0) return json(req, res, 200, { position: existing + 1, already: true });
    const position = db.push(name, { contact, interest: clean(b.interest, 60), at: new Date().toISOString() });
    return json(req, res, 201, { position });
  }

  if (p === "/api/contact" && M === "POST") {
    const b = await readBody(req);
    if (clean(b.name).length < 2 || !validEmail(b.email) || clean(b.message, 2000).length < 5) return fail(req, res, 400, "Please fill in your name, email and message.");
    db.push("messages", { name: clean(b.name, 80), email: clean(b.email, 120), message: clean(b.message, 2000), at: new Date().toISOString() });
    return json(req, res, 201, { ok: true });
  }

  // ---------------------------------------------------------------- admin
  if (p.startsWith("/api/admin/")) {
    if (!adminOk(req)) return fail(req, res, 401, "Wrong password");
    if (p === "/api/admin/catalog" && M === "GET") return json(req, res, 200, catalog.products.filter((product) => !product.unlisted).map((product) => ({ ...product, stock: catalog.stockOf(product) })));
    if (p === "/api/admin/summary") {
      const orders = db.get("orders", []);
      const live = orders.filter((o) => o.status !== "cancelled");
      return json(req, res, 200, {
        orders: orders.length,
        revenue: live.reduce((s, o) => s + o.total, 0),
        pending: orders.filter((o) => ["placed", "confirmed"].includes(o.status)).length,
        waitlist: db.get("waitlist", []).length,
        newsletter: db.get("newsletter", []).length,
        leads: db.get("leads", []).length,
        products: catalog.products.length,
        ...Object.assign({}, ...modules.filter((m) => m.adminSummary).map((m) => { try { return m.adminSummary(ctx); } catch { return {}; } })),
        lowStock: catalog.publicList().filter((x) => Object.values(x.stock).some((q) => q <= 3)).map((x) => ({ id: x.id, title: x.title, stock: x.stock })),
      });
    }
    if (p === "/api/admin/orders" && M === "GET") return json(req, res, 200, db.get("orders", []).slice().reverse());
    const st = p.match(/^\/api\/admin\/orders\/([A-Z0-9]+)$/);
    if (st && M === "PATCH") {
      const b = await readBody(req);
      const orders = db.get("orders", []);
      const o = orders.find((x) => x.id === st[1]);
      if (!o) return fail(req, res, 404, "No such order");
      if (b.courier !== undefined) o.courier = clean(b.courier, 40) || null;
      if (b.tracking !== undefined) o.tracking = clean(b.tracking, 60) || null;
      if (b.adminNote !== undefined) o.adminNote = clean(b.adminNote, 500);
      const status = b.status ?? o.status;
      if (!STATUSES.includes(status)) return fail(req, res, 400, "Bad status");
      if (RESTOCK.has(status) && !RESTOCK.has(o.status)) for (const i of o.items) if (catalog.byId[i.id]) setStock(i.id, i.size, (catalog.stockOf(catalog.byId[i.id])[i.size] || 0) + i.qty);
      const prevStatus = o.status;
      o.status = status;
      if (status !== prevStatus) o.history.push({ status, at: new Date().toISOString() });
      db.set("orders", orders);
      for (const m of modules) if (m.onOrderStatus) try { await m.onOrderStatus(o, prevStatus, ctx); } catch (e) { console.warn(`[${m.name}] onOrderStatus: ${e.message}`); }
      return json(req, res, 200, o);
    }
    if (p === "/api/admin/stock" && M === "POST") {
      const b = await readBody(req);
      if (!catalog.byId[b.id]) return fail(req, res, 404, "No such product");
      setStock(b.id, String(b.size), Number(b.qty));
      return json(req, res, 200, { ok: true, stock: catalog.stockOf(catalog.byId[b.id]) });
    }
    const list = p.match(/^\/api\/admin\/(waitlist|newsletter|messages|leads)$/);
    if (list) return json(req, res, 200, db.get(list[1], []).slice().reverse());
  }

  return fail(req, res, 404, "Not found");
}

// Line meta (e.g. measurements, gift-card recipient) is free-form but bounded.
function cleanMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(meta).slice(0, 30)) {
    if (typeof v === "boolean" || typeof v === "number") out[clean(k, 40)] = v;
    else if (v != null) out[clean(k, 40)] = clean(v, 300);
  }
  return out;
}

async function collectCredits(body, req) {
  const out = [];
  for (const m of modules) if (m.quoteCredit) {
    const c = await m.quoteCredit(body, ctx, req);
    if (c && c.amount > 0) out.push(c);
  }
  return out;
}

const ctx = {
  db, catalog, store, json, fail, send, readBody, clean, normPhone, validEmail, adminOk, parseCookies, priceCart, resolveCoupon, setStock,
  orders: () => db.get("orders", []),
};

function publicStore() {
  const s = store();
  const { coupons, ...rest } = s;
  return { ...rest, wheel: s.wheel.map(({ label, color, weight }) => ({ label, color, weight })) };
}

// ------------------------------------------------------------------ static

const indexHtml = () => fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
const originOf = (req) => process.env.SITE_URL?.replace(/\/$/, "") || `${req.headers["x-forwarded-proto"] === "https" ? "https" : "http"}://${req.headers.host || "localhost"}`;
const attr = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Outside photos go through our /img proxy so shared links and search results never show the source site.
const absUrl = (origin, u) => (/^https?:/.test(u) ? `${origin}/img?u=${encodeURIComponent(u)}` : origin + u);

// Structured data (JSON-LD) for search engines. "<" is escaped so no value can close the script tag.
const ldJson = (graph) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c")}</script>`;

// Designer Edit pieces come from other labels: structured data never names the label.
const brandRe = (brand) => new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
function unbranded(text, brand) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!brand) return t;
  const marked = t.replace(brandRe(brand), "\u0000");
  return marked.replace(/This piece comes from [^.!?]*\u0000[^.!?]*[.!?]?/g, "").split(/(?<=[.!?])\s+/).filter((s) => !s.includes("\u0000")).join(" ").replace(/\s+/g, " ").trim();
}

function structuredData(url, origin, p) {
  const s = store();
  const name = s.name || "Aarzu";
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const sameAs = Object.values(s.social || {}).filter((u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && x.pathname.length > 1; } catch { return false; } });
    return ldJson([
      { "@type": "Organization", "@id": `${origin}/#organization`, name, alternateName: s.urdu, url: `${origin}/`, logo: `${origin}/brand/aarzu-logo.png`, ...(sameAs.length ? { sameAs } : {}) },
      { "@type": "WebSite", "@id": `${origin}/#website`, name, alternateName: s.urdu, url: `${origin}/`, publisher: { "@id": `${origin}/#organization` },
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${origin}/shop?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
    ]);
  }
  if (!p) return "";
  const own = p.collection === "originals";
  const brand = own ? null : p.source?.brand;
  const link = `${origin}/product/${p.slug}`;
  const title = brand ? p.title.replace(brandRe(brand), " ").replace(/\s+/g, " ").replace(/^[\s·|-]+|[\s·|-]+$/g, "") : p.title;
  const inStock = Object.values(catalog.stockOf(p)).some((n) => n > 0);
  const reviews = db.get("reviews", []).filter((r) => r.productId === p.id && r.rating >= 1);
  const avg = reviews.reduce((a, r) => a + r.rating, 0) / (reviews.length || 1);
  const crumb = p.category === "accessory" ? ["Dupattas & Shawls", "/shop?category=accessory"] : p.category === "giftcard" ? ["Gift cards", "/gift-cards"] : p.gender === "women" ? ["Women", "/shop?gender=women"] : p.gender === "men" ? ["Men", "/shop?gender=men"] : ["Shop", "/shop"];
  return ldJson([
    {
      "@type": "Product", "@id": `${link}#product`, name: title, image: p.images.map((u) => absUrl(origin, u)), description: unbranded(p.description, brand) || title, sku: p.id, url: link,
      ...(own ? { brand: { "@type": "Brand", name: "Aarzu" } } : {}),
      offers: { "@type": "Offer", url: link, priceCurrency: "PKR", price: p.price, availability: `https://schema.org/${inStock ? "InStock" : "OutOfStock"}`, itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name } },
      ...(reviews.length ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Math.round(avg * 10) / 10, reviewCount: reviews.length, bestRating: 5, worstRating: 1 } } : {}),
    },
    { "@type": "BreadcrumbList", itemListElement: [["Home", "/"], crumb, [title, `/product/${p.slug}`]].map(([n, u], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: origin + u })) },
  ]);
}

// Link previews on WhatsApp/Facebook/Instagram don't run JavaScript, so the
// server writes the title, description and image for each page into the HTML.
function pageHtml(req, url) {
  const origin = originOf(req);
  let title = "Aarzu · Shalwar Kameez with the Soul of Pakistan";
  let desc = "Designer favourites for less and our own Aarzu Originals. Cash on delivery all over Pakistan.";
  let image = `${origin}/brand/aarzu-logo-stacked.png`;
  let type = "website";
  const m = url.pathname.match(/^\/product\/([\w-]+)/);
  const p = m && catalog.bySlug[m[1]];
  if (p) {
    title = `${p.title} · Rs ${p.price.toLocaleString("en-PK")} | Aarzu`;
    desc = unbranded(p.description, p.collection === "originals" ? null : p.source?.brand).slice(0, 200);
    const im = p.images[0] || "";
    image = absUrl(origin, im);
    type = "product";
  } else if (url.pathname.startsWith("/shop")) title = "Shop shalwar kameez | Aarzu";
  else if (url.pathname.startsWith("/western")) title = "Aarzu West · Coming soon";
  const noindex = /^\/(admin|checkout|order|account)/.test(url.pathname);
  const tags = `<meta property="og:site_name" content="Aarzu"><meta property="og:type" content="${type}"><meta property="og:title" content="${attr(title)}"><meta property="og:description" content="${attr(desc)}"><meta property="og:image" content="${attr(image)}"><meta property="og:url" content="${attr(origin + url.pathname)}"><meta name="twitter:card" content="summary_large_image"><link rel="canonical" href="${attr(origin + url.pathname)}">${noindex ? '<meta name="robots" content="noindex">' : ""}${p ? `<meta property="product:price:amount" content="${p.price}"><meta property="product:price:currency" content="PKR">` : ""}`;
  return indexHtml()
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`)
    .replace("</head>", () => `  ${tags}${structuredData(url, origin, p)}\n</head>`);
}

function sitemap(req) {
  const o = originOf(req);
  const pages = ["/", "/shop", "/shop?gender=women", "/shop?gender=men", "/shop?category=accessory", "/shop?collection=originals", "/western", "/about", "/faq", "/size-guide", "/shipping", "/contact", "/privacy", "/terms", "/returns-policy", "/stitching", "/gift-cards", "/rewards"];
  const urls = [...pages.map((u) => o + u), ...catalog.publicList().filter((p) => !p.unlisted).map((p) => `${o}/product/${p.slug}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${attr(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

function serveStatic(req, res, url) {
  if (url.pathname === "/robots.txt") return send(req, res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${originOf(req)}/sitemap.xml\n`, MIME[".txt"]);
  if (url.pathname === "/sitemap.xml") return send(req, res, 200, sitemap(req), "application/xml; charset=utf-8");
  if (url.pathname === "/" || url.pathname === "/index.html") return send(req, res, 200, pageHtml(req, url), MIME[".html"], { "Cache-Control": "no-cache" });
  // App files are always revalidated so phones pick up a new service worker or manifest quickly.
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest") {
    const f = path.join(PUBLIC, url.pathname);
    if (fs.existsSync(f)) return send(req, res, 200, fs.readFileSync(f), MIME[path.extname(f)], { "Cache-Control": "no-cache" });
  }
  let rel = decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return fail(req, res, 403, "Forbidden");
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      const ext = path.extname(file).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      const cache = /\.(woff2|svg|png|jpg|webp)$/.test(ext) ? "public, max-age=604800" : "no-cache";
      return send(req, res, 200, fs.readFileSync(file), type, { "Cache-Control": cache });
    }
    if (path.extname(rel)) return send(req, res, 404, "Not found", "text/plain; charset=utf-8");
    // Single-page app: every page route gets index.html (with that page's preview tags)
    send(req, res, 200, pageHtml(req, url), MIME[".html"], { "Cache-Control": "no-cache" });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    for (const m of modules) if (m.handle && (await m.handle(req, res, url, ctx))) return;
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/img") return await serveImage(url.searchParams.get("u"), path.join(DATA, "runtime", "img-cache"), res);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(req, res, e.message === "Invalid JSON" || e.message === "Payload too large" ? 400 : 500, e.message || "Server error");
  }
});

scheduleBackups();

server.listen(PORT, () => {
  console.log(`\n  ✿ Aarzu is live → http://localhost:${PORT}`);
  console.log(`    ${catalog.products.length} products loaded · ${modules.length} feature modules · admin at /admin`);
  if (!process.env.ADMIN_PASSWORD) console.log("    Admin uses data/admin-auth.json; a valid ADMIN_PASSWORD in .env overrides it.");
  brandHint();
});

function brandHint() {
  try {
    if (JSON.parse(fs.readFileSync(path.join(DATA, "catalog.brands.json"), "utf8")).length) return;
  } catch {}
  console.log("    No brand collection yet: import one with  npm run import -- <cowork-output.json>\n");
}
