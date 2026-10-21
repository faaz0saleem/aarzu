// Store policies: privacy, terms and returns & refunds. Needed by payment
// gateways and ad platforms. Text uses the live store settings.
import { esc, rs, state, registerRoute, registerLink } from "../core.js";

const page = (title, urdu, intro, sections) => (main) => {
  const s = state.store;
  main.innerHTML = `<section class="phero"><h1>${title}</h1><div class="urdu">${urdu}</div><p>${intro}</p></section>
  <section class="sec wrap"><div class="prose">${sections(s).map(([h, body]) => `<h2>${h}</h2>${body}`).join("")}
  <p style="margin-top:40px;color:var(--muted);font-size:.9rem">Last updated ${new Date(2026, 9, 18).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Questions? WhatsApp +${esc(s.contact.whatsapp)} or email ${esc(s.contact.email)}.</p></div></section>`;
};

const privacy = page("Privacy policy", "رازداری", "How Aarzu collects, uses and protects your information.", (s) => [
  ["What we collect", `<p>When you place an order we collect your name, mobile number, delivery address, city and (optionally) your email. If you create an account we also store a securely hashed password, saved addresses and your Aarzu Rewards points. If you join our waitlist or newsletter we store the email or number you give us.</p>`],
  ["How we use it", `<ul><li>To confirm, deliver and support your orders, including WhatsApp messages and calls about your order.</li><li>To share your name, number and address with our courier partner for delivery.</li><li>To send order updates by email if you gave one.</li><li>To send offers only if you subscribed. You can unsubscribe at any time.</li></ul>`],
  ["What we never do", `<p>We never sell your personal information. We do not store card numbers; payments by bank transfer or mobile wallet happen in your own banking app.</p>`],
  ["Cookies and analytics", `<p>We use your browser's local storage to remember your bag, wishlist and preferences, and a session cookie when you sign in. If enabled, we may use analytics or advertising pixels (such as Google Analytics or Meta Pixel) to understand visits and measure our ads.</p>`],
  ["Visitor counts", `<p>We use the existing random browser identifier in local storage to estimate unique visitors and browsers active in the last two minutes. While a storefront tab is visible it sends a small heartbeat to Aarzu. We store a hash of that identifier and short-lived activity timestamps, without recording an IP address, browsing history or personal contact details for these counters. Refreshes and tabs in one browser count once, while cleared storage, private browsing and different devices can count separately. These first-party counters respect Do Not Track and Global Privacy Control signals. Only the admin can view aggregate counts.</p>`],
  ["Your choices", `<p>You can ask us to show, correct or delete your personal information at any time by contacting us. We keep order records as long as needed for accounting and legal requirements.</p>`],
]);

const terms = page("Terms & conditions", "شرائط و ضوابط", "The rules for shopping with Aarzu.", (s) => [
  ["Orders", `<p>Placing an order is an offer to buy. We confirm every order by WhatsApp or phone before dispatch, and we may cancel orders we cannot confirm, orders with incorrect details, or orders affected by stock or pricing errors. If we cancel a paid order, we refund you in full.</p>`],
  ["Prices and payment", `<p>All prices are in Pakistani Rupees and include applicable taxes. Delivery is free on orders over ${rs(s.freeShippingThreshold)}, otherwise ${rs(s.shippingFee)}. We accept cash on delivery${s.cod?.maxTotal ? ` (up to ${rs(s.cod.maxTotal)})` : ""}, bank transfer and JazzCash/Easypaisa. Stitched-to-measure orders require advance payment.</p>`],
  ["Products and colours", `<p>We photograph our pieces carefully, but colours can look slightly different on different screens. Unstitched fabric lengths are approximate.</p>`],
  ["Discounts, gift cards and points", `<p>One discount code per order. Multi-buy and Complete-the-Look discounts apply automatically. Gift cards and Aarzu Rewards points have no cash value and can't be exchanged for cash.</p>`],
  ["Liability", `<p>Our responsibility for any order is limited to the amount you paid for it. Nothing in these terms limits your rights under Pakistani consumer protection law.</p>`],
  ["Contact", `<p>${esc(s.name)} · ${esc(s.contact.address)} · ${esc(s.contact.phone)} · ${esc(s.contact.email)}</p>`],
]);

const returns = page("Returns & refunds", "واپسی اور رقم کی واپسی", "Easy exchanges, fair refunds.", (s) => [
  ["Exchanges", `<p>Changed your mind about the size or colour? You can exchange unworn, unwashed items with tags and original packaging within <b>${s.returnDays} days</b> of delivery. WhatsApp us your order number to start; we'll arrange the pickup or tell you where to send it.</p>`],
  ["Refunds", `<p>If an item arrives damaged, faulty or different from what you ordered, tell us within 48 hours with photos and we'll replace it or refund you in full, including delivery. Refunds go back by bank transfer or mobile wallet within 7 working days of receiving the return.</p>`],
  ["Not returnable", `<ul><li>Stitched-to-measure orders and altered items (they're made just for you), unless faulty.</li><li>Items that have been worn, washed or have had their tags removed.</li><li>Gift cards.</li></ul>`],
  ["Refused deliveries", `<p>Refusing a cash-on-delivery parcel without a valid reason costs us two-way delivery. Numbers with repeated refusals may be asked to pay in advance for future orders.</p>`],
]);

export const css = false;

export function init() {
  registerRoute(/^\/privacy\/?$/, privacy);
  registerRoute(/^\/terms\/?$/, terms);
  registerRoute(/^\/returns-policy\/?$/, returns);
  registerLink({ where: "help", label: "Returns & refunds", href: "/returns-policy" });
  registerLink({ where: "help", label: "Privacy policy", href: "/privacy" });
  registerLink({ where: "help", label: "Terms & conditions", href: "/terms" });
}
