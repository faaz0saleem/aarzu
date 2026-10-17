// Aarzu storefront server: static site + JSON API. Zero dependencies.
//   npm start            -> http://localhost:3000
//   PORT=8080 npm start  -> custom port
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "aarzu-admin";

const db = new JsonStore(path.join(DATA, "runtime"));
const catalog = new Catalog(DATA, path.join(PUBLIC, "images", "originals", "photos"), db);
const store = () => JSON.parse(fs.readFileSync(path.join(DATA, "store.json"), "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = /^(text\/|application\/json|image\/svg|application\/manifest)/;

// ------------------------------------------------------------------ helpers

function send(req, res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const headers = { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...extra };
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

function resolveCoupon(code, phone) {
  if (!code) return { coupon: null };
  const c = store().coupons[String(code).toUpperCase().trim()];
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
  const h = req.headers.authorization || "";
  const given = Buffer.from(h.replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(ADMIN_PASSWORD);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
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
    return json(req, res, 200, { ...priceCart(b.items || [], catalog.byId, store(), r.coupon), couponError: r.error || null });
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
    const errors = {};
    if (clean(c.name).length < 2) errors.name = "Please enter your full name.";
    if (!phone) errors.phone = "Enter a valid Pakistani mobile number, e.g. 0300 1234567.";
    if (c.email && !validEmail(c.email)) errors.email = "That email doesn't look right.";
    if (!clean(c.city)) errors.city = "Choose your city.";
    if (clean(c.address, 500).length < 8) errors.address = "Please enter your full delivery address.";
    if (!["cod", "bank", "wallet"].includes(b.payment)) errors.payment = "Choose a payment method.";
    if (Object.keys(errors).length) return json(req, res, 422, { error: "Please check the highlighted fields.", errors });

    const r = resolveCoupon(b.code, c.phone);
    if (r.error) return json(req, res, 422, { error: r.error, errors: { code: r.error } });
    const quote = priceCart(b.items || [], catalog.byId, store(), r.coupon);
    if (!quote.items.length) return fail(req, res, 400, "Your bag is empty.");
    for (const i of quote.items) {
      const left = catalog.stockOf(catalog.byId[i.id])[i.size] ?? 0;
      if (left < i.qty) return fail(req, res, 409, `Sorry, only ${left} left of ${i.title} (${i.size}).`);
    }
    for (const i of quote.items) {
      const left = catalog.stockOf(catalog.byId[i.id])[i.size];
      catalog.setStock(i.id, i.size, left - i.qty);
    }
    const now = new Date().toISOString();
    const order = {
      id: "AZ" + Date.now().toString(36).toUpperCase().slice(-6) + crypto.randomInt(10, 99),
      createdAt: now,
      status: "placed",
      history: [{ status: "placed", at: now }],
      payment: b.payment,
      customer: { name: clean(c.name, 80), phone, email: clean(c.email, 120), city: clean(c.city, 60), address: clean(c.address, 500), notes: clean(c.notes, 500) },
      items: quote.items.map(({ id, title, image, size, qty, unit, line }) => ({ id, title, image, size, qty, unit, line })),
      subtotal: quote.subtotal,
      discounts: quote.discounts,
      shipping: quote.shipping,
      total: quote.total,
      coupon: quote.coupon,
    };
    db.push("orders", order);
    console.log(`[order] ${order.id} · ${order.customer.city} · Rs ${order.total}`);
    return json(req, res, 201, { id: order.id, total: order.total, payment: order.payment });
  }

  const track = p.match(/^\/api\/orders\/([A-Z0-9]+)$/);
  if (track && M === "GET") {
    const phone = normPhone(url.searchParams.get("phone"));
    const o = db.get("orders", []).find((x) => x.id === track[1]);
    if (!o || o.customer.phone !== phone) return fail(req, res, 404, "We couldn't find an order with that number and phone.");
    const { customer, ...rest } = o;
    return json(req, res, 200, { ...rest, customer: { name: customer.name, city: customer.city } });
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
        lowStock: catalog.publicList().filter((x) => Object.values(x.stock).some((q) => q <= 3)).map((x) => ({ id: x.id, title: x.title, stock: x.stock })),
      });
    }
    if (p === "/api/admin/orders" && M === "GET") return json(req, res, 200, db.get("orders", []).slice().reverse());
    const st = p.match(/^\/api\/admin\/orders\/([A-Z0-9]+)$/);
    if (st && M === "PATCH") {
      const b = await readBody(req);
      if (!["placed", "confirmed", "dispatched", "delivered", "cancelled"].includes(b.status)) return fail(req, res, 400, "Bad status");
      const orders = db.get("orders", []);
      const o = orders.find((x) => x.id === st[1]);
      if (!o) return fail(req, res, 404, "No such order");
      if (b.status === "cancelled" && o.status !== "cancelled") for (const i of o.items) catalog.setStock(i.id, i.size, (catalog.stockOf(catalog.byId[i.id] || { stock: {} })[i.size] || 0) + i.qty);
      o.status = b.status;
      o.history.push({ status: b.status, at: new Date().toISOString() });
      db.set("orders", orders);
      return json(req, res, 200, o);
    }
    if (p === "/api/admin/stock" && M === "POST") {
      const b = await readBody(req);
      if (!catalog.byId[b.id]) return fail(req, res, 404, "No such product");
      catalog.setStock(b.id, String(b.size), Number(b.qty));
      return json(req, res, 200, { ok: true, stock: catalog.stockOf(catalog.byId[b.id]) });
    }
    const list = p.match(/^\/api\/admin\/(waitlist|newsletter|messages|leads)$/);
    if (list) return json(req, res, 200, db.get(list[1], []).slice().reverse());
  }

  return fail(req, res, 404, "Not found");
}

function publicStore() {
  const s = store();
  const { coupons, ...rest } = s;
  return { ...rest, wheel: s.wheel.map(({ label, color, weight }) => ({ label, color, weight })) };
}

// ------------------------------------------------------------------ static

const indexHtml = () => fs.readFileSync(path.join(PUBLIC, "index.html"));

function serveStatic(req, res, url) {
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
    // Single-page app: every page route gets index.html
    send(req, res, 200, indexHtml(), MIME[".html"], { "Cache-Control": "no-cache" });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    if (url.pathname === "/img") return await serveImage(url.searchParams.get("u"), path.join(DATA, "runtime", "img-cache"), res);
    serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) fail(req, res, e.message === "Invalid JSON" || e.message === "Payload too large" ? 400 : 500, e.message || "Server error");
  }
});

server.listen(PORT, () => {
  console.log(`\n  ✿ Aarzu is live → http://localhost:${PORT}`);
  console.log(`    ${catalog.products.length} products loaded · admin at /admin`);
  if (!process.env.ADMIN_PASSWORD) console.log(`    (admin password is the default "aarzu-admin"; set ADMIN_PASSWORD to change it)`);
  brandHint();
});

function brandHint() {
  try {
    if (JSON.parse(fs.readFileSync(path.join(DATA, "catalog.brands.json"), "utf8")).length) return;
  } catch {}
  console.log("    No brand collection yet: import one with  npm run import -- <cowork-output.json>\n");
}
