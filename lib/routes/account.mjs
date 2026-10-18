// Customer accounts + Aarzu Rewards loyalty points · انعامات
//   GET  /api/account/program   public programme rules (tiers, welcome bonus, minimum to redeem)
//   POST /api/account/register  { name, phone, email?, password, claim? }  -> 201 profile + session cookie
//   POST /api/account/login     { phone, password, claim? }                -> profile + session cookie
//   POST /api/account/logout    ends the session and clears the cookie
//   GET  /api/account/me        401 when signed out, else profile, points, tier, ledger and orders
//   PUT  /api/account/me        { name?, email?, addresses?: [{ label, city, address }] } (max 5)
//   POST /api/account/password  { current, next }
//   POST /api/account/claim     { id } add an order placed with the account's own mobile number
//   GET  /api/admin/accounts    customers for the admin (never hashes)
//   POST /api/admin/accounts/:id/points  { delta, note } goodwill adjustment
//   POST /api/admin/accounts/:id/password  temporary password for a customer who forgot theirs
//
// Which orders belong to an account: orders placed while signed in, plus orders claimed with
// their order number (the phone on the order must match the account). A phone number alone is
// never enough, because phones aren't verified by SMS: otherwise anyone could register someone
// else's number and read their order history.
//
// Points: floor(total / 100) x tier multiplier, awarded once when an order is delivered,
// reversed if it is later cancelled. Points spent on a cancelled order are refunded.
// Sessions are stored as SHA-256 hashes of the cookie token, so the data file can't be replayed.
import crypto from "node:crypto";

const WELCOME = 200;
const MIN_REDEEM = 500;
const RS_PER_POINT = 100; // earn 1 point per Rs 100 paid
const MAX_AGE = 30 * 86400; // session length, seconds
const MAX_ADDRESSES = 5;

// rate is the multiplier x 100, so points are computed with integer maths
export const TIERS = [
  { key: "noor", name: "Noor", urdu: "نور", meaning: "light", min: 0, rate: 100, perks: ["1 point for every Rs 100 you spend", `${WELCOME} welcome points when you join`, "Saved addresses for one-tap checkout", "All your orders in one place"] },
  { key: "zar", name: "Zar", urdu: "زر", meaning: "gold", min: 2500, rate: 125, perks: ["1.25× points on every order", "Everything in Noor"] },
  { key: "shahi", name: "Shahi", urdu: "شاہی", meaning: "royal", min: 7500, rate: 150, perks: ["1.5× points on every order", "Everything in Zar"] },
];
const tierFor = (lifetime) => [...TIERS].reverse().find((t) => lifetime >= t.min) || TIERS[0];
const nextTierFor = (lifetime) => TIERS.find((t) => t.min > lifetime) || null;
const earnFor = (total, tier) => Math.floor((Math.max(0, Math.round(Number(total) || 0)) * tier.rate) / (RS_PER_POINT * 100));
const pubTier = (t) => ({ key: t.key, name: t.name, urdu: t.urdu, meaning: t.meaning, min: t.min, multiplier: t.rate / 100, perks: t.perks });

// ------------------------------------------------------------------ storage helpers
const accounts = (ctx) => ctx.db.get("accounts", []);
const saveAccounts = (ctx) => ctx.db.set("accounts", accounts(ctx));
const now = () => new Date().toISOString();
const newId = () => "AC" + crypto.randomBytes(6).toString("hex").toUpperCase();
const hashToken = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString("hex");
const DUMMY_SALT = crypto.randomBytes(16).toString("hex");

function checkPw(a, pw) {
  const given = Buffer.from(hashPw(pw, a.salt), "hex");
  const want = Buffer.from(a.hash, "hex");
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function addEntry(a, entry) {
  a.ledger.push({ ...entry, at: now() });
  a.points = Math.max(0, a.points + entry.points);
}
// Net points for one order across a set of ledger entry types
const net = (a, orderId, types) => a.ledger.filter((l) => l.orderId === orderId && types.includes(l.type)).reduce((s, l) => s + l.points, 0);
const ownerOf = (ctx, orderId) => accounts(ctx).find((a) => (a.orderIds || []).includes(orderId));
function link(a, orderId) {
  a.orderIds ||= [];
  if (!a.orderIds.includes(orderId)) a.orderIds.push(orderId);
}

// Brings an account's points for one order in line with the order's status. Idempotent.
function reconcile(a, o) {
  let changed = false;
  const earned = net(a, o.id, ["earn", "reverse"]);
  if (o.status === "delivered" && earned <= 0) {
    const pts = earnFor(o.total, tierFor(a.lifetimePoints));
    if (pts > 0) {
      addEntry(a, { type: "earn", points: pts, orderId: o.id });
      a.lifetimePoints += pts;
      changed = true;
    }
  }
  if (o.status === "cancelled" && earned > 0) {
    addEntry(a, { type: "reverse", points: -earned, orderId: o.id });
    a.lifetimePoints = Math.max(0, a.lifetimePoints - earned);
    changed = true;
  }
  // Points spent on the order: refunded while it is cancelled, charged again if it is reinstated
  const used = (o.credits || []).find((c) => c.key === "points")?.amount || 0;
  const spent = -net(a, o.id, ["redeem", "refund"]);
  const target = o.status === "cancelled" ? 0 : used;
  if (spent > target) { addEntry(a, { type: "refund", points: spent - target, orderId: o.id }); changed = true; }
  else if (spent < target && a.points > 0) { addEntry(a, { type: "redeem", points: -Math.min(target - spent, a.points), orderId: o.id }); changed = true; }
  return changed;
}

// ------------------------------------------------------------------ sessions + cookies
function readToken(req, ctx) {
  try {
    const t = ctx.parseCookies(req).az_session;
    return /^[a-f0-9]{64}$/.test(t || "") ? t : null;
  } catch {
    return null;
  }
}

function sessionOf(req, ctx) {
  const token = readToken(req, ctx);
  if (!token) return null;
  const h = hashToken(token);
  const s = ctx.db.get("sessions", []).find((x) => x.token === h);
  if (!s || Date.parse(s.expiresAt) < Date.now()) return null;
  const account = accounts(ctx).find((a) => a.id === s.accountId);
  return account ? { account, session: s } : null;
}

function startSession(ctx, accountId) {
  const token = crypto.randomBytes(32).toString("hex");
  const t = Date.now();
  let list = ctx.db.get("sessions", []).filter((s) => Date.parse(s.expiresAt) > t);
  const mine = list.filter((s) => s.accountId === accountId);
  if (mine.length >= 10) { const drop = new Set(mine.slice(0, mine.length - 9).map((s) => s.token)); list = list.filter((s) => !drop.has(s.token)); }
  list.push({ token: hashToken(token), accountId, createdAt: new Date(t).toISOString(), expiresAt: new Date(t + MAX_AGE * 1000).toISOString() });
  ctx.db.set("sessions", list);
  return token;
}

// az_session is the secret (HttpOnly); az_in=1 only tells the page someone is signed in,
// so signed-out visitors never trigger a 401 just by loading the site.
function cookies(req, token) {
  const secure = req.socket?.encrypted || /^https/i.test(String(req.headers["x-forwarded-proto"] || "")) ? "; Secure" : "";
  const age = token ? MAX_AGE : 0;
  return [`az_session=${token || ""}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`, `az_in=${token ? 1 : ""}; SameSite=Lax; Path=/; Max-Age=${age}${secure}`];
}

// ------------------------------------------------------------------ rate limits (in memory)
const hits = new Map();
// Returns 0 when allowed, else the minutes to wait.
function limited(key, max, windowMs) {
  const t = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
  const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
  if (list.length >= max) { hits.set(key, list); return Math.max(1, Math.ceil((windowMs - (t - list[0])) / 60000)); }
  list.push(t);
  hits.set(key, list);
  return 0;
}
const ipOf = (req) => String(req.socket?.remoteAddress || "?");
const readJson = async (ctx, req, limit) => { const b = await ctx.readBody(req, limit); return b && typeof b === "object" && !Array.isArray(b) ? b : {}; };
const MIN15 = 15 * 60000;

// ------------------------------------------------------------------ views
const prettyPhone = (p) => (p ? `0${p.slice(2, 5)} ${p.slice(5)}` : "");

function orderView(o, a, tier) {
  const live = !["delivered", "cancelled"].includes(o.status);
  const earned = net(a, o.id, ["earn", "reverse"]);
  const first = o.items?.[0] || {};
  return {
    id: o.id, createdAt: o.createdAt, total: o.total, status: o.status, city: o.customer?.city || "",
    items: (o.items || []).reduce((s, i) => s + (i.qty || 0), 0), lines: (o.items || []).length,
    image: first.image || "", title: first.title || "",
    points: live ? earnFor(o.total, tier) : Math.max(0, earned),
    pointsState: live ? "pending" : earned > 0 ? "earned" : "none",
    usedPoints: Math.max(0, -net(a, o.id, ["redeem", "refund"])),
  };
}

function profile(a, ctx) {
  const tier = tierFor(a.lifetimePoints);
  const next = nextTierFor(a.lifetimePoints);
  const byId = new Map(ctx.orders().map((o) => [o.id, o]));
  const orders = (a.orderIds || []).map((id) => byId.get(id)).filter(Boolean)
    .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt)).map((o) => orderView(o, a, tier));
  return {
    id: a.id, name: a.name, phone: a.phone, phoneDisplay: prettyPhone(a.phone), email: a.email || "", createdAt: a.createdAt,
    addresses: a.addresses || [], points: a.points, lifetimePoints: a.lifetimePoints,
    tier: pubTier(tier), nextTier: next ? { ...pubTier(next), toGo: next.min - a.lifetimePoints } : null,
    pending: orders.filter((o) => o.pointsState === "pending").reduce((s, o) => s + o.points, 0),
    ledger: a.ledger.slice(-20).reverse(), orders,
    program: { welcome: WELCOME, minRedeem: MIN_REDEEM, perRupees: RS_PER_POINT },
  };
}

// Links an order the shopper knows the number of, if it was placed with their own phone.
function claim(ctx, a, rawId) {
  const id = String(rawId || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(id)) return { error: "Enter your order number, e.g. AZ1A2B3C45.", status: 400 };
  const o = ctx.orders().find((x) => x.id === id);
  if (!o || o.customer?.phone !== a.phone) return { error: "We couldn't find that order for your mobile number.", status: 404 };
  const owner = ownerOf(ctx, id);
  if (owner && owner.id !== a.id) return { error: "This order is already in another Aarzu account.", status: 409 };
  if (owner) return { already: true, id };
  link(a, id);
  reconcile(a, o);
  return { claimed: true, id };
}

// ------------------------------------------------------------------ validation
const validName = (ctx, n) => ctx.clean(n, 60).length >= 2;
const validPw = (p) => typeof p === "string" && p.length >= 8 && p.length <= 128;

function cleanAddresses(ctx, list) {
  if (!Array.isArray(list)) return { error: "Addresses must be a list." };
  if (list.length > MAX_ADDRESSES) return { error: `You can save up to ${MAX_ADDRESSES} addresses.` };
  const cities = ctx.store().cities.map((c) => c.name);
  const out = [];
  for (const [i, x] of list.entries()) {
    const label = ctx.clean(x?.label, 30) || "Home";
    const city = ctx.clean(x?.city, 60);
    const address = ctx.clean(x?.address, 500);
    if (!cities.includes(city)) return { error: "Choose a city for every address.", index: i, field: "city" };
    if (address.length < 8) return { error: "Please enter the full address: house, street, area.", index: i, field: "address" };
    out.push({ label, city, address });
  }
  return { addresses: out };
}

// ------------------------------------------------------------------ module hooks
export async function handle(req, res, url, ctx) {
  const p = url.pathname;
  const M = req.method;
  if (!p.startsWith("/api/account/") && p !== "/api/admin/accounts" && !p.startsWith("/api/admin/accounts/")) return false;
  const reply = (status, body, extra = {}) => { ctx.send(req, res, status, body, "application/json; charset=utf-8", { "Cache-Control": "no-store", ...extra }); return true; };
  const fail = (status, error, errors) => reply(status, errors ? { error, errors } : { error });

  // -------------------------------------------------------------- public
  if (p === "/api/account/program" && M === "GET") {
    return reply(200, { welcome: WELCOME, minRedeem: MIN_REDEEM, perRupees: RS_PER_POINT, tiers: TIERS.map(pubTier) });
  }

  if (p === "/api/account/register" && M === "POST") {
    const wait = limited("ip:" + ipOf(req), 30, MIN15);
    if (wait) return fail(429, `Too many attempts. Please try again in ${wait} min.`);
    const b = await readJson(ctx, req, 20_000);
    const phone = ctx.normPhone(b.phone);
    const errors = {};
    if (!validName(ctx, b.name)) errors.name = "Please enter your name.";
    if (!phone) errors.phone = "Enter a valid Pakistani mobile number, e.g. 0300 1234567.";
    if (b.email && (!ctx.validEmail(b.email) || String(b.email).length > 120)) errors.email = "That email doesn't look right.";
    if (!validPw(b.password)) errors.password = "Use at least 8 characters.";
    if (Object.keys(errors).length) return fail(422, "Please check the highlighted fields.", errors);
    if (accounts(ctx).some((a) => a.phone === phone)) return fail(409, "An account with this number already exists. Please sign in.", { phone: "This number already has an account. Sign in instead." });
    const salt = crypto.randomBytes(16).toString("hex");
    const a = {
      id: newId(), name: ctx.clean(b.name, 60), phone, email: ctx.clean(b.email, 120), hash: hashPw(b.password, salt), salt,
      createdAt: now(), lastLoginAt: now(), addresses: [], points: WELCOME, lifetimePoints: WELCOME,
      ledger: [{ type: "welcome", points: WELCOME, at: now() }], orderIds: [],
    };
    accounts(ctx).push(a);
    const claimed = b.claim ? claim(ctx, a, b.claim) : null;
    saveAccounts(ctx);
    const token = startSession(ctx, a.id);
    console.log(`[account] new member ${a.id}`);
    return reply(201, { ...profile(a, ctx), claimed: claimed?.claimed || false }, { "Set-Cookie": cookies(req, token) });
  }

  if (p === "/api/account/login" && M === "POST") {
    const b = await readJson(ctx, req, 20_000);
    const phone = ctx.normPhone(b.phone);
    if (!phone) return fail(422, "Enter the mobile number you signed up with.", { phone: "Enter a valid Pakistani mobile number, e.g. 0300 1234567." });
    if (typeof b.password !== "string" || !b.password) return fail(422, "Enter your password.", { password: "Enter your password." });
    const wait = limited("login:" + phone, 8, MIN15) || limited("ip:" + ipOf(req), 30, MIN15);
    if (wait) return fail(429, `Too many sign-in attempts. Please try again in ${wait} min.`);
    const a = accounts(ctx).find((x) => x.phone === phone);
    const pw = b.password.slice(0, 128);
    const ok = a ? checkPw(a, pw) : (hashPw(pw, DUMMY_SALT), false);
    if (!ok) return fail(401, "That number and password don't match.", { password: "That number and password don't match." });
    hits.delete("login:" + phone);
    a.lastLoginAt = now();
    const claimed = b.claim ? claim(ctx, a, b.claim) : null;
    saveAccounts(ctx);
    const token = startSession(ctx, a.id);
    return reply(200, { ...profile(a, ctx), claimed: claimed?.claimed || false }, { "Set-Cookie": cookies(req, token) });
  }

  if (p === "/api/account/logout" && M === "POST") {
    const token = readToken(req, ctx);
    if (token) {
      const h = hashToken(token);
      const list = ctx.db.get("sessions", []);
      if (list.some((s) => s.token === h)) ctx.db.set("sessions", list.filter((s) => s.token !== h));
    }
    return reply(200, { ok: true }, { "Set-Cookie": cookies(req, null) });
  }

  // -------------------------------------------------------------- signed in
  if (p.startsWith("/api/account/")) {
    const s = sessionOf(req, ctx);
    if (!s) return reply(401, { error: "Please sign in." }, readToken(req, ctx) ? { "Set-Cookie": cookies(req, null) } : {});
    const a = s.account;

    if (p === "/api/account/me" && M === "GET") return reply(200, profile(a, ctx));

    if (p === "/api/account/me" && M === "PUT") {
      const b = await readJson(ctx, req, 20_000);
      const errors = {};
      if (b.name !== undefined && !validName(ctx, b.name)) errors.name = "Please enter your name.";
      if (b.email && (!ctx.validEmail(b.email) || String(b.email).length > 120)) errors.email = "That email doesn't look right.";
      let addresses = null;
      if (b.addresses !== undefined) {
        const r = cleanAddresses(ctx, b.addresses);
        if (r.error) errors.addresses = r.error;
        else addresses = r.addresses;
      }
      if (Object.keys(errors).length) return fail(422, errors.addresses || "Please check the highlighted fields.", errors);
      if (b.name !== undefined) a.name = ctx.clean(b.name, 60);
      if (b.email !== undefined) a.email = ctx.clean(b.email, 120);
      if (addresses) a.addresses = addresses;
      saveAccounts(ctx);
      return reply(200, profile(a, ctx));
    }

    if (p === "/api/account/password" && M === "POST") {
      const b = await readJson(ctx, req, 20_000);
      const wait = limited("pw:" + a.id, 8, MIN15);
      if (wait) return fail(429, `Too many attempts. Please try again in ${wait} min.`);
      if (typeof b.current !== "string" || !checkPw(a, b.current.slice(0, 128))) return fail(422, "Your current password isn't right.", { current: "That isn't your current password." });
      if (!validPw(b.next)) return fail(422, "Use at least 8 characters.", { next: "Use at least 8 characters." });
      a.salt = crypto.randomBytes(16).toString("hex");
      a.hash = hashPw(b.next, a.salt);
      saveAccounts(ctx);
      // Sign out every other device
      ctx.db.set("sessions", ctx.db.get("sessions", []).filter((x) => x.accountId !== a.id || x.token === s.session.token));
      return reply(200, { ok: true });
    }

    if (p === "/api/account/claim" && M === "POST") {
      const wait = limited("claim:" + a.id, 10, 60 * 60000);
      if (wait) return fail(429, `Too many tries. Please try again in ${wait} min.`);
      const b = await readJson(ctx, req, 5_000);
      const r = claim(ctx, a, b.id);
      if (r.error) return fail(r.status, r.error, { id: r.error });
      saveAccounts(ctx);
      return reply(200, { ...profile(a, ctx), claimed: !!r.claimed, already: !!r.already });
    }

    return fail(404, "Not found");
  }

  // -------------------------------------------------------------- admin
  if (!ctx.adminOk(req)) return fail(401, "Wrong password");
  if (p === "/api/admin/accounts" && M === "GET") {
    const orders = ctx.orders();
    const byId = new Map(orders.map((o) => [o.id, o]));
    const byPhone = {};
    for (const o of orders) byPhone[o.customer?.phone] = (byPhone[o.customer?.phone] || 0) + 1;
    return reply(200, accounts(ctx).map((a) => {
      const mine = (a.orderIds || []).map((id) => byId.get(id)).filter(Boolean);
      const live = mine.filter((o) => o.status !== "cancelled");
      return {
        id: a.id, name: a.name, phone: a.phone, email: a.email || "", createdAt: a.createdAt, lastLoginAt: a.lastLoginAt || null,
        points: a.points, lifetimePoints: a.lifetimePoints, tier: tierFor(a.lifetimePoints).name,
        orders: mine.length, delivered: mine.filter((o) => o.status === "delivered").length, spend: live.reduce((s, o) => s + o.total, 0),
        phoneOrders: byPhone[a.phone] || 0, addresses: (a.addresses || []).length,
        redeemed: Math.max(0, -a.ledger.filter((l) => l.type === "redeem" || l.type === "refund").reduce((s, l) => s + l.points, 0)),
      };
    }).reverse());
  }
  const adj = p.match(/^\/api\/admin\/accounts\/(AC[A-F0-9]{12})\/points$/);
  if (adj && M === "POST") {
    const a = accounts(ctx).find((x) => x.id === adj[1]);
    if (!a) return fail(404, "No such customer");
    const b = await readJson(ctx, req, 5_000);
    const delta = Math.trunc(Number(b.delta));
    if (!delta || Math.abs(delta) > 100_000) return fail(400, "Enter a whole number of points between -100,000 and 100,000.");
    addEntry(a, { type: "adjust", points: delta, note: ctx.clean(b.note, 120) || "Adjusted by Aarzu" });
    saveAccounts(ctx);
    return reply(200, { id: a.id, points: a.points });
  }
  // Forgotten password: the team sets a temporary one and sends it to the customer on WhatsApp.
  const rst = p.match(/^\/api\/admin\/accounts\/(AC[A-F0-9]{12})\/password$/);
  if (rst && M === "POST") {
    const a = accounts(ctx).find((x) => x.id === rst[1]);
    if (!a) return fail(404, "No such customer");
    const ABC = "abcdefghjkmnpqrstuvwxyz23456789";
    const temp = Array.from({ length: 10 }, () => ABC[crypto.randomInt(ABC.length)]).join("");
    a.salt = crypto.randomBytes(16).toString("hex");
    a.hash = hashPw(temp, a.salt);
    saveAccounts(ctx);
    ctx.db.set("sessions", ctx.db.get("sessions", []).filter((x) => x.accountId !== a.id));
    return reply(200, { id: a.id, temp });
  }
  return fail(404, "Not found");
}

// Checkout credit: { key: "points", payload: { points } } -> up to the member's balance.
export function quoteCredit(body, ctx, req) {
  const want = (Array.isArray(body?.credits) ? body.credits : []).find((c) => c && c.key === "points");
  if (!want) return null;
  const requested = Math.floor(Number(want.payload?.points));
  if (!(requested > 0)) return null;
  const s = sessionOf(req, ctx);
  if (!s) throw new Error("Please sign in again to use your Aarzu Rewards points.");
  const a = s.account;
  if (a.points < MIN_REDEEM) throw new Error(`You need at least ${MIN_REDEEM} points to redeem. You have ${a.points}.`);
  return {
    key: "points",
    label: "Aarzu Rewards points",
    amount: Math.min(requested, a.points),
    commit(order, applied) {
      const pts = Math.min(Math.max(0, Math.floor(applied)), a.points);
      if (pts > 0) addEntry(a, { type: "redeem", points: -pts, orderId: order.id });
      link(a, order.id);
      saveAccounts(ctx);
    },
  };
}

// Orders placed while signed in belong to that account.
export function onOrder(order, ctx, req) {
  const s = sessionOf(req, ctx);
  if (!s || ownerOf(ctx, order.id)) return;
  link(s.account, order.id);
  saveAccounts(ctx);
}

export function onOrderStatus(order, prevStatus, ctx) {
  const a = ownerOf(ctx, order.id);
  if (a && reconcile(a, order)) saveAccounts(ctx);
}

export function adminSummary(ctx) {
  const list = accounts(ctx);
  return { members: list.length, pointsOutstanding: list.reduce((s, a) => s + a.points, 0) };
}
