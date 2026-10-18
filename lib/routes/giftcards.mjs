// Aarzu digital gift cards · تحفہ کارڈ
//   onOrder        issues one code per gift card bought, as "pending"
//   onOrderStatus  confirmed / dispatched / delivered -> "active" (valid 12 months from then);
//                  cancelled -> "void", and any gift card balance that paid for the cancelled
//                  order goes back onto its card (taken again if the order is reinstated)
//   quoteCredit    checkout credit { key: "giftcard", payload: { code } }; also checks gift card
//                  lines (recipient name + WhatsApp/email) before an order is accepted
//   GET  /api/giftcards/<code>          masked balance check (repeated misses are rate-limited)
//   GET  /api/admin/giftcards           every card, newest first (admin)
//   POST /api/admin/giftcards/<code>    { action: "sent" | "void" | "activate" } (admin)
//   adminSummary   { giftcardsOutstanding, giftcardsToSend }
import crypto from "node:crypto";

const DB = "giftcards";
const KEY = "giftcard";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0 or 1 to misread
const LIVE = new Set(["confirmed", "dispatched", "delivered"]);
const VALID_MONTHS = 12;
const MAX_MESSAGE = 200;

const now = () => new Date().toISOString();
const plusMonths = (iso, n) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString(); };
const isGiftCard = (p) => p?.category === "giftcard";
const last4 = (code) => code.slice(-4);
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return ""; } };

// "azgc 7k3m-p9qa", "AZGC7K3MP9QA" or "7K3M P9QA" -> "AZGC-7K3M-P9QA"; null if it can't be one of ours
export function normCode(raw) {
  let s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 12 && s.startsWith("AZGC")) s = s.slice(4);
  if (s.length !== 8 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return `AZGC-${s.slice(0, 4)}-${s.slice(4)}`;
}

function newCode(taken) {
  for (;;) {
    let s = "";
    for (let i = 0; i < 8; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
    const code = `AZGC-${s.slice(0, 4)}-${s.slice(4)}`;
    if (!taken.has(code)) { taken.add(code); return code; }
  }
}

// An active card past its date reads as "expired"; everything else is stored as-is.
const statusOf = (c) => (c.status === "active" && Date.parse(c.expiresAt) < Date.now() ? "expired" : c.status);
const WHY = {
  pending: "This gift card isn't active yet. It switches on as soon as the order it came from is confirmed.",
  void: "This gift card has been cancelled.",
  expired: "This gift card has expired.",
  redeemed: "This gift card has been fully used.",
};
const NOT_FOUND = "We couldn't find that gift card. Please check the code and try again.";

// Guessing codes: after MAX_MISSES unknown codes from one address, lookups pause for a while.
const misses = new Map();
const WINDOW = 15 * 60e3, MAX_MISSES = 20;
const ipOf = (req) => String(req?.socket?.remoteAddress || "?");
function limited(req) {
  const m = misses.get(ipOf(req));
  return !!m && Date.now() - m.since < WINDOW && m.n >= MAX_MISSES;
}
function miss(req) {
  const k = ipOf(req), m = misses.get(k);
  if (misses.size > 5000) misses.clear();
  if (!m || Date.now() - m.since > WINDOW) misses.set(k, { n: 1, since: Date.now() });
  else m.n++;
}
const TOO_MANY = "Too many gift card tries. Please wait a few minutes and try again.";

const publicView = (c) => {
  const status = statusOf(c);
  return { code: `AZGC-••••-${last4(c.code)}`, last4: last4(c.code), value: c.initial, balance: status === "active" ? c.balance : 0, status, expiresAt: c.expiresAt };
};

// ------------------------------------------------------------------ HTTP
export async function handle(req, res, url, ctx) {
  const p = url.pathname;
  const pub = p.match(/^\/api\/giftcards\/([^/]{1,60})$/);
  if (pub && req.method === "GET") {
    if (limited(req)) return ctx.fail(req, res, 429, TOO_MANY), true;
    const code = normCode(safeDecode(pub[1]));
    const c = code && ctx.db.get(DB, []).find((x) => x.code === code);
    if (!c) { miss(req); ctx.fail(req, res, 404, NOT_FOUND); return true; }
    ctx.json(req, res, 200, publicView(c));
    return true;
  }

  if (p !== "/api/admin/giftcards" && !p.startsWith("/api/admin/giftcards/")) return false;
  if (!ctx.adminOk(req)) return ctx.fail(req, res, 401, "Wrong password"), true;

  if (p === "/api/admin/giftcards" && req.method === "GET") {
    const orders = Object.fromEntries(ctx.orders().map((o) => [o.id, o]));
    const list = ctx.db.get(DB, []).slice().reverse().map((c) => ({
      ...c, status: statusOf(c), orderStatus: orders[c.orderId]?.status || null, buyer: orders[c.orderId]?.customer?.name || null,
    }));
    ctx.json(req, res, 200, list);
    return true;
  }

  const one = p.match(/^\/api\/admin\/giftcards\/([^/]{1,60})$/);
  if (one && req.method === "POST") {
    const b = await ctx.readBody(req);
    const code = normCode(safeDecode(one[1]));
    const cards = ctx.db.get(DB, []);
    const c = code && cards.find((x) => x.code === code);
    if (!c) return ctx.fail(req, res, 404, "No such gift card"), true;
    const at = now();
    if (b.action === "sent") {
      if (["pending", "void"].includes(c.status)) return ctx.fail(req, res, 400, "This card isn't active, so it can't be sent yet."), true;
      c.sentAt = at;
    } else if (b.action === "void") {
      c.status = "void";
      c.voidedAt = at;
      c.voidReason = "admin";
    } else if (b.action === "activate") {
      if (!["pending", "void"].includes(c.status)) return ctx.fail(req, res, 400, "Only pending or cancelled cards can be activated."), true;
      activate(c, at);
    } else return ctx.fail(req, res, 400, "Unknown action"), true;
    ctx.db.set(DB, cards);
    ctx.json(req, res, 200, { ...c, status: statusOf(c) });
    return true;
  }
  ctx.fail(req, res, 404, "Not found");
  return true;
}

function activate(c, at) {
  c.status = c.balance > 0 ? "active" : "redeemed";
  if (!c.activatedAt) {
    c.activatedAt = at;
    c.expiresAt = plusMonths(at, VALID_MONTHS); // 12 months from the day it can be used
  }
  delete c.voidReason;
  delete c.voidedAt;
}

// ------------------------------------------------------------------ checkout
// Gift card lines must say who they're for: checked here because this hook runs before
// every quote and order, so a bad line is refused instead of creating a card with no recipient.
function checkGiftLines(items, ctx) {
  for (const l of Array.isArray(items) ? items : []) {
    if (!isGiftCard(ctx.catalog.byId[l?.id])) continue;
    const m = l.meta && typeof l.meta === "object" ? l.meta : {};
    const to = ctx.clean(m.to, 60);
    if (to.length < 2) throw new Error("Please add the name of the person each gift card is for.");
    if (!ctx.normPhone(m.toContact) && !ctx.validEmail(String(m.toContact || "").trim())) throw new Error(`Please add a WhatsApp number or email for ${to}'s gift card.`);
    if (String(m.message || "").length > MAX_MESSAGE) throw new Error(`Gift card messages can be up to ${MAX_MESSAGE} characters.`);
  }
}

export function quoteCredit(body, ctx, req) {
  checkGiftLines(body?.items, ctx);
  const entry = (Array.isArray(body?.credits) ? body.credits : []).find((c) => c?.key === KEY);
  if (!entry) return null;
  if (limited(req)) throw new Error(TOO_MANY);
  const code = normCode(entry.payload?.code);
  const c = code && ctx.db.get(DB, []).find((x) => x.code === code);
  if (!c) { miss(req); throw new Error(NOT_FOUND); }
  const st = statusOf(c);
  if (st !== "active") throw new Error(WHY[st] || "This gift card can't be used right now.");
  if (!(c.balance > 0)) throw new Error(WHY.redeemed);
  return {
    key: KEY,
    label: `Gift card ••${last4(code)}`,
    amount: c.balance,
    commit(order, applied) {
      if (!(applied > 0)) return;
      const cards = ctx.db.get(DB, []);
      const card = cards.find((x) => x.code === code);
      if (!card) return;
      const take = Math.min(card.balance, Math.round(applied));
      if (take < applied) console.warn(`[giftcards] ${order.id}: card ••${last4(code)} only covered Rs ${take} of Rs ${applied}`);
      card.balance -= take;
      card.history.push({ orderId: order.id, amount: take, at: now() });
      if (card.balance <= 0) { card.balance = 0; card.status = "redeemed"; }
      ctx.db.set(DB, cards);
    },
  };
}

// ------------------------------------------------------------------ order hooks
export function onOrder(order, ctx) {
  const lines = (order.items || []).filter((i) => isGiftCard(ctx.catalog.byId[i.id]));
  if (!lines.length) return;
  const cards = ctx.db.get(DB, []);
  const taken = new Set(cards.map((c) => c.code));
  const at = now();
  for (const i of lines) {
    const value = ctx.catalog.byId[i.id].price;
    const m = i.meta || {};
    for (let n = 0; n < Math.max(1, Math.min(10, Number(i.qty) || 1)); n++) {
      cards.push({
        code: newCode(taken), initial: value, balance: value, status: "pending", orderId: order.id,
        to: ctx.clean(m.to, 60), toContact: ctx.clean(m.toContact, 120), from: ctx.clean(m.from, 60) || order.customer?.name || "",
        message: ctx.clean(m.message, MAX_MESSAGE), createdAt: at, expiresAt: plusMonths(at, VALID_MONTHS), history: [],
      });
    }
  }
  ctx.db.set(DB, cards);
  console.log(`[giftcards] ${order.id}: ${lines.reduce((s, i) => s + i.qty, 0)} card(s) issued, pending payment`);
}

export function onOrderStatus(order, prev, ctx) {
  const cards = ctx.db.get(DB, []);
  const at = now();
  const cancelledNow = order.status === "cancelled" && prev !== "cancelled";
  const reinstated = prev === "cancelled" && order.status !== "cancelled";
  let changed = false;
  for (const c of cards) {
    // cards bought in this order
    if (c.orderId === order.id) {
      if (LIVE.has(order.status) && (c.status === "pending" || (c.status === "void" && c.voidReason === "order-cancelled"))) {
        activate(c, at);
        changed = true;
      } else if (cancelledNow && ["pending", "active", "redeemed"].includes(c.status)) {
        Object.assign(c, { status: "void", voidedAt: at, voidReason: "order-cancelled" });
        changed = true;
      }
    }
    // cards that paid for this order
    const lines = c.history.filter((h) => h.orderId === order.id);
    if (!lines.length) continue;
    const net = lines.reduce((s, h) => s + h.amount, 0);
    if (cancelledNow && net > 0) {
      c.balance += net;
      c.history.push({ orderId: order.id, amount: -net, at, note: "Order cancelled: refunded to card" });
      if (c.status === "redeemed") c.status = "active";
      changed = true;
    } else if (reinstated && net === 0) {
      const refunded = -lines.filter((h) => h.amount < 0).reduce((s, h) => s + h.amount, 0);
      const take = Math.min(c.balance, refunded);
      if (take > 0) {
        c.balance -= take;
        c.history.push({ orderId: order.id, amount: take, at, note: "Order reinstated" });
        if (c.balance <= 0) { c.balance = 0; if (c.status === "active") c.status = "redeemed"; }
        changed = true;
      }
      if (take < refunded) console.warn(`[giftcards] ${order.id} reinstated: card ••${last4(c.code)} could only cover Rs ${take} of Rs ${refunded} again`);
    }
  }
  if (changed) ctx.db.set(DB, cards);
}

export function adminSummary(ctx) {
  const live = ctx.db.get(DB, []).filter((c) => statusOf(c) === "active");
  return {
    giftcardsOutstanding: live.reduce((s, c) => s + c.balance, 0),
    giftcardsToSend: live.filter((c) => !c.sentAt).length,
  };
}
