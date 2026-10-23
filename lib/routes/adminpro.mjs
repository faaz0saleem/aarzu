// Aarzu admin tools: insights, coupon codes, CSV exports (the invoice page is client-side).
//   GET   /api/admin/insights?days=7|30|90|all     sales numbers for one period (PKT calendar days, incl. today)
//   GET   /api/admin/coupons                       codes from db "coupons" with use counts, plus read-only store.json codes
//   POST  /api/admin/coupons                       create { code, type, value, minSubtotal, expiresOn, maxUses, firstOrderOnly, label }
//   PATCH /api/admin/coupons/<CODE>                edit the same fields (not the code), or { active: false | true }
//   GET   /api/admin/export/orders.csv?days=N&status=S
//   GET   /api/admin/export/courier.csv            bulk-booking sheet for confirmed orders
//   resolveCoupon  db codes that are active, not expired and under their max uses
//   adminSummary   { couponsActive, confirmedToBook }
// Every /api/admin/* route here checks ctx.adminOk(req).

const DB = "coupons";
const STATUSES = ["placed", "confirmed", "dispatched", "delivered", "cancelled", "returned"];
const DROPPED = new Set(["cancelled", "returned"]); // not counted as revenue
const TYPES = ["percent", "fixed", "freeship"];
const PAYMENTS = { cod: "Cash on delivery", bank: "Bank transfer", wallet: "JazzCash / Easypaisa" };
const PKT = 5 * 3600e3; // Pakistan time, UTC+5, no daylight saving
const DAY = 864e5;

// ------------------------------------------------------------------ dates (PKT)
const dayKey = (t) => new Date(t + PKT).toISOString().slice(0, 10);
const keyTime = (k) => Date.parse(`${k}T00:00:00Z`);
const addDays = (k, n) => dayKey(keyTime(k) - PKT + n * DAY);
const weekKey = (k) => addDays(k, -((new Date(keyTime(k)).getUTCDay() + 6) % 7)); // Monday
const stamp = (iso) => new Date(Date.parse(iso) + PKT).toISOString().slice(0, 16).replace("T", " ");
const at = (o) => Date.parse(o?.createdAt);

// days: a whole number of days (1..3650) or null for all time. The period is calendar days in
// Pakistan time ending today, so "7" is today and the 6 days before it.
function parseDays(v) {
  if (v == null || v === "" || v === "all") return null;
  const n = Math.floor(Number(v));
  return n >= 1 && n <= 3650 ? n : 30;
}
const startKeyOf = (days) => (days ? addDays(dayKey(Date.now()), -(days - 1)) : null);
const inRange = (o, startKey) => Number.isFinite(at(o)) && (!startKey || dayKey(at(o)) >= startKey);

// ------------------------------------------------------------------ coupons
const usesOf = (code, orders) => orders.filter((o) => o.coupon === code && o.status !== "cancelled").length;
const expiryTime = (c) => (c.expiresOn ? Date.parse(`${c.expiresOn}T23:59:59+05:00`) : Infinity);
function stateOf(c, uses) {
  if (!c.active) return "disabled";
  if (Date.now() > expiryTime(c)) return "expired";
  if (c.maxUses && uses >= c.maxUses) return "used-up";
  return "active";
}
const fmtRs = (n) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
export const autoLabel = (c) => (c.type === "percent" ? `${c.value}% off` : c.type === "fixed" ? `${fmtRs(c.value)} off` : "Free delivery");

// The shape pricing.js understands: { type, value, label, minSubtotal?, firstOrderOnly? }.
// server.mjs adds the code, checks firstOrderOnly against the phone and store.json wins on a clash.
export function resolveCoupon(code, ctx) {
  const c = ctx.db.get(DB, []).find((x) => x.code === code);
  if (!c || stateOf(c, usesOf(code, ctx.orders())) !== "active") return null;
  const out = { type: c.type, label: c.label || autoLabel(c) };
  if (c.type !== "freeship") out.value = c.value;
  if (c.type !== "freeship" && c.minSubtotal) out.minSubtotal = c.minSubtotal;
  if (c.firstOrderOnly) out.firstOrderOnly = true;
  return out;
}

const reserved = (ctx) => {
  const s = ctx.store();
  return new Set([...Object.keys(s.coupons || {}), s.launchOffer?.code].filter(Boolean).map((k) => String(k).toUpperCase()));
};

// Returns { coupon } or { error, field }. `prev` is the stored coupon when editing.
function validate(b, ctx, prev) {
  const err = (field, error) => ({ field, error });
  const code = prev ? prev.code : String(b.code ?? "").toUpperCase().trim();
  if (!prev) {
    if (code.startsWith("AZP")) return err("code", "AZP codes are reserved for creator partnerships.");
    if (!/^[A-Z0-9]{3,20}$/.test(code)) return err("code", "Use 3 to 20 letters (A–Z) and numbers, no spaces.");
    if (reserved(ctx).has(code)) return err("code", "This code is already in data/store.json. Pick another one.");
    if (ctx.db.get(DB, []).some((x) => x.code === code)) return err("code", "This code already exists. Edit it in the list below.");
  }
  const type = String(b.type ?? "");
  if (!TYPES.includes(type)) return err("type", "Choose percent, fixed or free delivery.");
  const num = (v) => (v === "" || v == null ? null : Number(v));
  let value = null;
  if (type === "percent") {
    value = num(b.value);
    if (!Number.isInteger(value) || value < 1 || value > 90) return err("value", "Percent off must be a whole number from 1 to 90.");
  } else if (type === "fixed") {
    value = num(b.value);
    if (!Number.isInteger(value) || value < 10 || value > 50000) return err("value", "Rupees off must be a whole number from 10 to 50,000.");
  }
  let minSubtotal = num(b.minSubtotal);
  if (minSubtotal === 0) minSubtotal = null;
  if (minSubtotal != null) {
    if (type === "freeship") return err("minSubtotal", "Free delivery codes can't have a minimum spend.");
    if (!Number.isInteger(minSubtotal) || minSubtotal < 1 || minSubtotal > 500000) return err("minSubtotal", "Minimum spend must be a whole number of rupees.");
    if (type === "fixed" && minSubtotal < value) return err("minSubtotal", "Minimum spend should be at least the rupees off.");
  }
  let expiresOn = String(b.expiresOn ?? "").trim() || null;
  if (expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || !Number.isFinite(Date.parse(`${expiresOn}T00:00:00Z`)) || new Date(`${expiresOn}T00:00:00Z`).toISOString().slice(0, 10) !== expiresOn) return err("expiresOn", "Pick a valid date.");
    if (!prev && expiresOn < dayKey(Date.now())) return err("expiresOn", "The expiry date is in the past.");
  }
  let maxUses = num(b.maxUses);
  if (maxUses === 0) maxUses = null;
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000000)) return err("maxUses", "Max uses must be a whole number, or empty for no limit.");
  const label = ctx.clean(b.label, 60);
  return { coupon: { code, type, value, label, minSubtotal, expiresOn, maxUses, firstOrderOnly: !!b.firstOrderOnly } };
}

function couponList(ctx) {
  const orders = ctx.orders();
  const s = ctx.store();
  const view = (c) => { const uses = usesOf(c.code, orders); return { ...c, label: c.label || autoLabel(c), uses, state: stateOf(c, uses) }; };
  const ended = s.launchOffer?.endsAt && Date.now() > Date.parse(s.launchOffer.endsAt);
  return {
    codes: ctx.db.get(DB, []).slice().reverse().map(view),
    storeCodes: Object.entries(s.coupons || {}).map(([code, c]) => ({
      code, type: c.type, value: c.value ?? null, label: c.label || "", minSubtotal: c.minSubtotal || null, firstOrderOnly: !!c.firstOrderOnly,
      uses: usesOf(code, orders), endsAt: code === s.launchOffer?.code ? s.launchOffer.endsAt : null, ended: code === s.launchOffer?.code && !!ended,
    })),
  };
}

// ------------------------------------------------------------------ insights
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const qtyOf = (o) => sum(o.items || [], (i) => i.qty);
const rate = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

function insights(ctx, days) {
  const all = ctx.orders().filter((o) => Number.isFinite(at(o)));
  const startKey = startKeyOf(days);
  const orders = all.filter((o) => inRange(o, startKey));
  const kept = orders.filter((o) => !DROPPED.has(o.status));
  const live = orders.filter((o) => o.status !== "cancelled");
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]));
  const revenue = sum(kept, (o) => o.total);
  const finished = (list) => ({ delivered: list.filter((o) => o.status === "delivered").length, returned: list.filter((o) => o.status === "returned").length });
  const outcome = (list) => { const f = finished(list); return { ...f, rate: rate(f.returned, f.delivered + f.returned) }; };

  // payment mix: share of all orders placed; revenue from kept orders
  const payment = Object.keys(PAYMENTS).map((k) => {
    const list = orders.filter((o) => o.payment === k);
    return { key: k, label: PAYMENTS[k], orders: list.length, share: rate(list.length, orders.length), revenue: sum(list.filter((o) => !DROPPED.has(o.status)), (o) => o.total), refusal: outcome(list) };
  });

  // revenue by day (by week when the period is long)
  const todayKey = dayKey(Date.now());
  const firstKey = startKey || (all.length ? dayKey(Math.min(...all.map(at))) : todayKey);
  const span = Math.round((keyTime(todayKey) - keyTime(firstKey)) / DAY) + 1;
  const bucket = span > 120 ? "week" : "day";
  const series = [];
  if (orders.length || days) {
    const idx = new Map();
    for (let k = bucket === "week" ? weekKey(firstKey) : firstKey; k <= todayKey; k = addDays(k, bucket === "week" ? 7 : 1)) {
      idx.set(k, series.length);
      series.push({ date: k, revenue: 0, orders: 0, dropped: 0 });
    }
    for (const o of orders) {
      const k = dayKey(at(o));
      const row = series[idx.get(bucket === "week" ? weekKey(k) : k)];
      if (!row) continue;
      if (DROPPED.has(o.status)) row.dropped++;
      else { row.revenue += o.total || 0; row.orders++; }
    }
  }

  // top products (kept orders, line totals before order-level discounts)
  const prod = new Map();
  for (const o of kept) for (const i of o.items || []) {
    const p = prod.get(i.id) || { id: i.id, title: i.title, qty: 0, sales: 0, orders: new Set() };
    p.qty += i.qty || 0;
    p.sales += i.line || 0;
    p.orders.add(o.id);
    prod.set(i.id, p);
  }
  const topProducts = [...prod.values()].sort((a, b) => b.qty - a.qty || b.sales - a.sales).slice(0, 10).map((p) => ({ ...p, orders: p.orders.size }));

  // cities (every order placed; refusal rate = returned / (delivered + returned))
  const cityMap = new Map();
  for (const o of orders) {
    const name = String(o.customer?.city || "").trim() || "Unknown";
    (cityMap.get(name) || cityMap.set(name, []).get(name)).push(o);
  }
  const cities = [...cityMap.entries()].map(([city, list]) => ({ city, orders: list.length, revenue: sum(list.filter((o) => !DROPPED.has(o.status)), (o) => o.total), cancelled: list.filter((o) => o.status === "cancelled").length, ...outcome(list) }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue);

  // coupon usage (orders not cancelled, the same rule as the use count)
  const cMap = new Map();
  for (const o of live) {
    if (!o.coupon) continue;
    const c = cMap.get(o.coupon) || { code: o.coupon, uses: 0, discount: 0, total: 0, freeDelivery: 0 };
    c.uses++;
    c.discount += sum((o.discounts || []).filter((d) => d.key === "coupon"), (d) => d.amount);
    c.total += o.total || 0;
    if (!(o.discounts || []).some((d) => d.key === "coupon")) c.freeDelivery++;
    cMap.set(o.coupon, c);
  }
  const coupons = [...cMap.values()].sort((a, b) => b.uses - a.uses || b.discount - a.discount);

  // new vs returning customers, by phone (cancelled orders are left out)
  const history = new Map();
  for (const o of all.filter((x) => x.status !== "cancelled").sort((a, b) => at(a) - at(b))) {
    const p = o.customer?.phone;
    if (!p) continue;
    (history.get(p) || history.set(p, []).get(p)).push(o);
  }
  const phones = new Set(live.map((o) => o.customer?.phone).filter(Boolean));
  let fresh = 0, cameBack = 0, returning = 0;
  for (const p of phones) {
    const h = history.get(p) || [];
    if (inRange(h[0], startKey)) { fresh++; if (h.length > 1) cameBack++; } else returning++;
  }
  const repeatOrders = live.filter((o) => (history.get(o.customer?.phone) || [])[0] !== o).length;

  return {
    days, from: startKey, to: todayKey, bucket, totalOrdersEver: all.length,
    orders: { placed: orders.length, kept: kept.length, byStatus },
    revenue, deliveredRevenue: sum(kept.filter((o) => o.status === "delivered"), (o) => o.total),
    aov: kept.length ? Math.round(revenue / kept.length) : 0,
    items: sum(kept, qtyOf),
    discounts: sum(kept, (o) => sum(o.discounts || [], (d) => d.amount)),
    credits: sum(kept, (o) => sum(o.credits || [], (c) => c.amount)),
    payment,
    prepaid: { orders: sum(payment.filter((p) => p.key !== "cod"), (p) => p.orders), share: rate(sum(payment.filter((p) => p.key !== "cod"), (p) => p.orders), orders.length) },
    refusal: outcome(orders),
    cancelRate: rate(byStatus.cancelled, orders.length),
    series, topProducts, cities: cities.slice(0, 10), cityCount: cities.length, coupons,
    customers: { total: phones.size, new: fresh, cameBack, returning, repeatOrders, orders: live.length, repeatShare: rate(repeatOrders, live.length) },
  };
}

// ------------------------------------------------------------------ CSV
// Quotes, commas and line breaks are quoted; cells that Excel would run as a formula get a leading '.
function cell(v) {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const localPhone = (p) => (/^92\d{10}$/.test(String(p)) ? "0" + String(p).slice(2) : String(p || ""));
const prettyPhone = (p) => { const l = localPhone(p); return /^0\d{10}$/.test(l) ? `${l.slice(0, 4)} ${l.slice(4)}` : l; };
const shippable = (o) => (o.items || []).filter((i) => !i.meta?.digital);
const itemText = (i) => `${i.title} (${i.size}) x${i.qty}${(i.addons || []).length ? ` + ${i.addons.map((a) => a.label).join(", ")}` : ""}`;

function sendCsv(req, res, ctx, name, rows) {
  ctx.send(req, res, 200, csv(rows), "text/csv; charset=utf-8", {
    "Content-Disposition": `attachment; filename="${name}-${dayKey(Date.now())}.csv"`,
    "Cache-Control": "no-store",
  });
}

function ordersCsv(ctx, days, status) {
  const startKey = startKeyOf(days);
  const list = ctx.orders().filter((o) => inRange(o, startKey) && (!status || o.status === status)).sort((a, b) => at(a) - at(b));
  const rows = [["id", "date", "status", "name", "phone", "email", "city", "address", "items", "qty", "subtotal", "discounts", "credits", "delivery", "total", "payment", "courier", "tracking"]];
  for (const o of list) {
    const c = o.customer || {};
    rows.push([
      o.id, stamp(o.createdAt), o.status, c.name, prettyPhone(c.phone), c.email || "", c.city, c.address,
      (o.items || []).map(itemText).join("; "), qtyOf(o), o.subtotal, sum(o.discounts || [], (d) => d.amount), sum(o.credits || [], (x) => x.amount),
      o.shipping, o.total, PAYMENTS[o.payment] || o.payment, o.courier || "", o.tracking || "",
    ]);
  }
  return rows;
}

function courierCsv(ctx) {
  const list = ctx.orders().filter((o) => o.status === "confirmed" && shippable(o).length).sort((a, b) => at(a) - at(b));
  const rows = [["consignee name", "phone", "address", "city", "COD amount", "item description", "pieces", "order ref"]];
  for (const o of list) {
    const c = o.customer || {};
    const lines = shippable(o);
    rows.push([c.name, localPhone(c.phone), c.address, c.city, o.payment === "cod" ? o.total : 0, lines.map(itemText).join("; ").slice(0, 250), sum(lines, (i) => i.qty), o.id]);
  }
  return rows;
}

// ------------------------------------------------------------------ HTTP
export async function handle(req, res, url, ctx) {
  const p = url.pathname;
  const mine = p === "/api/admin/insights" || p === "/api/admin/coupons" || p.startsWith("/api/admin/coupons/") || p.startsWith("/api/admin/export/");
  if (!mine) return false;
  if (!ctx.adminOk(req)) return ctx.fail(req, res, 401, "Wrong password"), true;
  const M = req.method;

  if (p === "/api/admin/insights" && M === "GET") return ctx.json(req, res, 200, insights(ctx, parseDays(url.searchParams.get("days")))), true;

  if (p === "/api/admin/coupons" && M === "GET") return ctx.json(req, res, 200, couponList(ctx)), true;
  if (p === "/api/admin/coupons" && M === "POST") {
    const r = validate(await ctx.readBody(req), ctx, null);
    if (r.error) return ctx.json(req, res, 422, r), true;
    const now = new Date().toISOString();
    const list = ctx.db.get(DB, []);
    const c = { ...r.coupon, active: true, createdAt: now, updatedAt: now };
    list.push(c);
    ctx.db.set(DB, list);
    console.log(`[adminpro] coupon ${c.code} created`);
    return ctx.json(req, res, 201, c), true;
  }
  const one = p.match(/^\/api\/admin\/coupons\/([A-Za-z0-9]{1,20})$/);
  if (one && M === "PATCH") {
    const b = await ctx.readBody(req);
    const list = ctx.db.get(DB, []);
    const c = list.find((x) => x.code === one[1].toUpperCase());
    if (!c) return ctx.fail(req, res, 404, "No such code"), true;
    if (Object.keys(b).length === 1 && typeof b.active === "boolean") {
      c.active = b.active;
    } else {
      const r = validate(b, ctx, c);
      if (r.error) return ctx.json(req, res, 422, r), true;
      Object.assign(c, r.coupon);
      if (typeof b.active === "boolean") c.active = b.active;
    }
    c.updatedAt = new Date().toISOString();
    ctx.db.set(DB, list);
    return ctx.json(req, res, 200, c), true;
  }

  if (p === "/api/admin/export/orders.csv" && M === "GET") {
    const status = url.searchParams.get("status") || "";
    if (status && status !== "all" && !STATUSES.includes(status)) return ctx.fail(req, res, 400, "Bad status"), true;
    const days = parseDays(url.searchParams.get("days"));
    sendCsv(req, res, ctx, `aarzu-orders${status && status !== "all" ? "-" + status : ""}${days ? `-${days}d` : ""}`, ordersCsv(ctx, days, status === "all" ? "" : status));
    return true;
  }
  if (p === "/api/admin/export/courier.csv" && M === "GET") return sendCsv(req, res, ctx, "aarzu-courier-booking", courierCsv(ctx)), true;

  ctx.fail(req, res, 404, "Not found");
  return true;
}

export function adminSummary(ctx) {
  const orders = ctx.orders();
  return {
    couponsActive: ctx.db.get(DB, []).filter((c) => stateOf(c, usesOf(c.code, orders)) === "active").length,
    confirmedToBook: orders.filter((o) => o.status === "confirmed" && shippable(o).length).length,
  };
}
