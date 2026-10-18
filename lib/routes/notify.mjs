// Order notifications: instant owner alerts (email + Telegram) and branded
// customer emails when an order is placed, dispatched, delivered or cancelled.
// Configure in .env: SMTP_*, MAIL_FROM, ORDER_ALERT_EMAIL, TELEGRAM_*, SITE_URL.
import { sendMail, sendTelegram, mailEnabled, telegramEnabled } from "../mailer.mjs";

const SITE = () => (process.env.SITE_URL || "").replace(/\/$/, "");
const money = (n) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PAY = { cod: "Cash on delivery", bank: "Bank transfer", wallet: "JazzCash / Easypaisa" };

function shell(store, title, inner) {
  const logo = SITE() ? `<img src="${SITE()}/brand/aarzu-logo.png" alt="Aarzu" width="180" style="display:block;margin:0 auto 6px">` : `<div style="font:600 28px Georgia,serif;letter-spacing:8px;color:#1E1324">AARZU</div>`;
  return `<!doctype html><html><body style="margin:0;background:#FFF8EF;font-family:Helvetica,Arial,sans-serif;color:#1E1324">
  <div style="height:6px;background:linear-gradient(90deg,#D6246E,#F26B1D,#F2A900,#0FA3A3,#1C2A6B)"></div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden">
  <tr><td style="padding:28px 28px 8px;text-align:center">${logo}<div style="font-size:12px;letter-spacing:3px;color:#A3164F;text-transform:uppercase">${h(title)}</div></td></tr>
  <tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.6">${inner}</td></tr>
  <tr><td style="padding:18px 28px;background:#1E1324;color:#F7E7C1;font-size:12px;text-align:center">
  ${h(store.name)} · WhatsApp +${h(store.contact.whatsapp)} · ${h(store.contact.email)}<br>آپ کی آرزو، ہماری ذمہ داری</td></tr>
  </table></td></tr></table></body></html>`;
}

function itemsTable(o) {
  const rows = o.items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f0e6da">${h(i.title)}<br><span style="color:#8A7C8E;font-size:13px">${h(i.size)} × ${i.qty}${(i.addons || []).map((a) => ` · ${h(a.label)}`).join("")}${i.meta?.summary ? ` · ${h(i.meta.summary)}` : ""}</span></td><td style="padding:8px 0;border-bottom:1px solid #f0e6da;text-align:right;white-space:nowrap">${money(i.line)}</td></tr>`).join("");
  const line = (l, v, c = "") => `<tr><td style="padding:4px 0;${c}">${l}</td><td style="padding:4px 0;text-align:right;${c}">${v}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}
    ${line("Subtotal", money(o.subtotal))}
    ${(o.discounts || []).map((d) => line(h(d.label), "−" + money(d.amount), "color:#0B5D4B")).join("")}
    ${line("Delivery", o.shipping ? money(o.shipping) : "FREE")}
    ${(o.credits || []).map((c) => line(h(c.label), "−" + money(c.amount), "color:#0B5D4B")).join("")}
    ${line("<b>Total</b>", `<b>${money(o.total)}</b>`, "border-top:2px solid #1E1324;padding-top:8px")}</table>`;
}

function paymentNote(store, o) {
  if (o.payment === "cod") return `<p>Please keep <b>${money(o.total)}</b> ready in cash for the rider.</p>`;
  const d = store.payments?.[o.payment]?.details;
  return `<p style="background:#FFF1D6;padding:14px;border-radius:12px"><b>Next step: payment.</b><br>${d ? h(d).replace(/\n/g, "<br>") : "We'll WhatsApp you our account details shortly."}<br>Please send a screenshot of the transfer on WhatsApp with your order number <b>${h(o.id)}</b>.</p>`;
}

const trackLink = (o) => (SITE() ? `<p style="text-align:center;margin:22px 0"><a href="${SITE()}/track?id=${h(o.id)}" style="background:#D6246E;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:600">Track your order</a></p>` : "");

async function safe(label, fn) {
  try { await fn(); } catch (e) { console.warn(`[notify] ${label}: ${e.message}`); }
}

async function orderPlaced(o, ctx) {
  const store = ctx.store();
  const c = o.customer;
  const owners = (process.env.ORDER_ALERT_EMAIL || "").split(",").map((s) => s.trim()).filter(Boolean);
  const adminLink = SITE() ? `<p><a href="${SITE()}/admin">Open the admin dashboard</a></p>` : "";
  await safe("owner email", () => sendMail({
    to: owners,
    subject: `🛍️ New order ${o.id} · ${money(o.total)} · ${c.city}`,
    html: shell(store, "New order", `<p><b>${h(c.name)}</b> · +${h(c.phone)}${c.email ? ` · ${h(c.email)}` : ""}<br>${h(c.address)}, ${h(c.city)}${c.notes ? `<br><i>Note: ${h(c.notes)}</i>` : ""}</p>
      <p>Payment: <b>${PAY[o.payment] || h(o.payment)}</b>${o.coupon ? ` · code ${h(o.coupon)}` : ""}</p>${itemsTable(o)}
      <p><a href="https://wa.me/${h(c.phone)}?text=${encodeURIComponent(`Assalam o Alaikum ${c.name}! This is Aarzu. Please reply YES to confirm your order ${o.id} of ${money(o.total)}.`)}">Confirm with the customer on WhatsApp</a></p>${adminLink}`),
  }));
  await safe("telegram", () => sendTelegram(`🛍️ <b>New order ${h(o.id)}</b> · ${money(o.total)}\n${h(c.name)} · ${h(c.city)} · +${h(c.phone)}\n${PAY[o.payment] || h(o.payment)}\n${o.items.map((i) => `• ${h(i.title)} (${h(i.size)}) ×${i.qty}${(i.addons || []).length ? " + stitching" : ""}`).join("\n")}`));
  if (c.email) await safe("customer email", () => sendMail({
    to: c.email,
    subject: `Shukriya! We've received your Aarzu order ${o.id}`,
    html: shell(store, "Order received", `<p>Assalam o Alaikum ${h(c.name.split(" ")[0])},</p><p>Thank you for shopping with Aarzu! We've received your order <b>${h(o.id)}</b> and our team will confirm it on WhatsApp shortly.</p>
      ${itemsTable(o)}${paymentNote(store, o)}<p>Delivering to: ${h(c.address)}, ${h(c.city)}</p>${trackLink(o)}`),
  }));
}

async function statusChanged(o, prev, ctx) {
  const store = ctx.store();
  const c = o.customer;
  if (o.status === "returned") await safe("telegram", () => sendTelegram(`↩️ Order ${h(o.id)} was refused/returned (${h(c.city)}, +${h(c.phone)})`));
  if (!c.email || o.status === prev) return;
  const first = h(c.name.split(" ")[0]);
  const T = {
    confirmed: [`Your Aarzu order ${o.id} is confirmed`, "Order confirmed", `<p>Assalam o Alaikum ${first}, your order <b>${h(o.id)}</b> is confirmed and being prepared with love.</p>${trackLink(o)}`],
    dispatched: [`Your Aarzu order ${o.id} is on its way 🚚`, "On its way", `<p>Good news ${first}! Your order <b>${h(o.id)}</b> has left our studio${o.courier ? ` with <b>${h(o.courier)}</b>` : ""}.</p>${o.tracking ? `<p style="font-size:18px;text-align:center">Tracking number: <b>${h(o.tracking)}</b></p>` : ""}${o.payment === "cod" ? `<p>Please keep <b>${money(o.total)}</b> ready for the rider.</p>` : ""}${trackLink(o)}`],
    delivered: [`Delivered! We hope you love it, ${c.name.split(" ")[0]}`, "Delivered", `<p>Your order <b>${h(o.id)}</b> has been delivered. We hope it feels like a wish come true. 💫</p><p>If anything isn't perfect, exchanges are easy within ${store.returnDays} days. Just WhatsApp us.</p>${SITE() ? `<p>We'd love a review on the product page; it helps other shoppers.</p>` : ""}`],
    cancelled: [`Your Aarzu order ${o.id} was cancelled`, "Order cancelled", `<p>Your order <b>${h(o.id)}</b> has been cancelled. If this is unexpected, please WhatsApp us on +${h(store.contact.whatsapp)}.</p>`],
  }[o.status];
  if (T) await safe(`customer ${o.status} email`, () => sendMail({ to: c.email, subject: T[0], html: shell(store, T[1], T[2]) }));
}

// Fire and forget: a slow mail server must never delay the shopper's checkout.
export function onOrder(o, ctx) {
  orderPlaced(o, ctx).catch((e) => console.warn(`[notify] ${e.message}`));
}
export function onOrderStatus(o, prev, ctx) {
  statusChanged(o, prev, ctx).catch((e) => console.warn(`[notify] ${e.message}`));
}

export function adminSummary() {
  return { notifications: { email: mailEnabled(), telegram: telegramEnabled() } };
}

if (!mailEnabled() && !telegramEnabled()) console.log("    [notify] email/Telegram alerts are off (set SMTP_* or TELEGRAM_* in .env)");
