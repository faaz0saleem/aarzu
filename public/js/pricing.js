// Cart pricing shared by the browser and the server, so the total a shopper
// sees is exactly the total the server charges.
//
// A cart line is { id, size, qty, addons?: [{ key, option }], meta?: {} }.
// Add-ons (e.g. stitching) are priced from store.addons and only apply to the
// product categories they list. Credits (gift cards, reward points) are applied
// last, after delivery, and can never take the total below zero.

export const isSuit = (p) => p && (p.category === "unstitched" || p.category === "ready-to-wear");
export const isAccessory = (p) => p && p.category === "accessory";

export const lineKey = (l) => [l.id, l.size, JSON.stringify(l.addons || []), JSON.stringify(l.meta || {})].join("|");

export function resolveAddons(p, addons, store) {
  const out = [];
  for (const a of [].concat(addons || [])) {
    const def = store.addons?.[a?.key];
    const opt = def?.options?.[a?.option];
    if (!def || !opt) continue;
    if (def.appliesTo && !def.appliesTo.includes(p.category)) continue;
    out.push({ key: a.key, option: a.option, label: opt.label, price: opt.price });
  }
  return out;
}

export function priceCart(lines, byId, store, coupon = null, { credits = [] } = {}) {
  const items = [];
  for (const l of lines) {
    const p = byId[l.id];
    const qty = Math.max(1, Math.min(10, Math.floor(Number(l.qty) || 1)));
    if (!p) continue;
    const addons = resolveAddons(p, l.addons, store);
    const addonUnit = addons.reduce((s, a) => s + a.price, 0);
    items.push({
      key: lineKey(l), id: p.id, slug: p.slug, title: p.title, image: p.images[0], size: l.size, qty,
      unit: p.price + addonUnit, base: p.price, addons, meta: l.meta || null,
      compareAt: p.compareAt || null, line: (p.price + addonUnit) * qty, baseLine: p.price * qty,
      suit: isSuit(p), accessory: isAccessory(p), noDiscount: !!p.noDiscount,
    });
  }
  const subtotal = items.reduce((s, i) => s + i.line, 0);
  const suitQty = items.filter((i) => i.suit).reduce((s, i) => s + i.qty, 0);
  const suitSub = items.filter((i) => i.suit).reduce((s, i) => s + i.baseLine, 0);
  const accSub = items.filter((i) => i.accessory).reduce((s, i) => s + i.baseLine, 0);
  const undiscountable = items.filter((i) => i.noDiscount).reduce((s, i) => s + i.line, 0);
  const discounts = [];

  const tier = [...(store.multiBuy || [])].sort((a, b) => a.minItems - b.minItems).filter((t) => suitQty >= t.minItems).pop();
  if (tier) discounts.push({ key: "multibuy", label: `Buy ${tier.minItems}+ suits: ${tier.percent}% off`, amount: Math.round((suitSub * tier.percent) / 100) });
  if (suitQty > 0 && accSub > 0 && store.bundle) discounts.push({ key: "bundle", label: `${store.bundle.label}: ${store.bundle.percent}% off accessories`, amount: Math.round((accSub * store.bundle.percent) / 100) });

  const afterAuto = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  let couponApplied = null;
  const couponBase = Math.max(0, afterAuto - undiscountable);
  if (coupon && coupon.type === "percent" && (!coupon.minSubtotal || couponBase >= coupon.minSubtotal)) {
    const amount = Math.round((couponBase * coupon.value) / 100);
    discounts.push({ key: "coupon", label: coupon.label, amount });
    couponApplied = coupon.code;
  }
  if (coupon && coupon.type === "fixed" && (!coupon.minSubtotal || couponBase >= coupon.minSubtotal)) {
    discounts.push({ key: "coupon", label: coupon.label, amount: Math.min(couponBase, Math.round(coupon.value)) });
    couponApplied = coupon.code;
  }
  const discounted = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  const freeByCoupon = coupon && coupon.type === "freeship";
  if (freeByCoupon) couponApplied = coupon.code;
  const freeShip = freeByCoupon || discounted >= store.freeShippingThreshold;
  const shippable = items.some((i) => !i.meta?.digital);
  const shipping = items.length === 0 || freeShip || !shippable ? 0 : store.shippingFee;

  let due = discounted + shipping;
  const appliedCredits = [];
  for (const c of credits || []) {
    const amount = Math.max(0, Math.min(due, Math.round(Number(c.amount) || 0)));
    if (!amount) continue;
    appliedCredits.push({ key: c.key, label: c.label, amount });
    due -= amount;
  }
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    suitQty,
    subtotal,
    discounts,
    savings: discounts.reduce((s, d) => s + d.amount, 0) + items.reduce((s, i) => s + (i.compareAt ? (i.compareAt - i.base) * i.qty : 0), 0),
    shipping,
    freeShippingRemaining: freeShip || !shippable ? 0 : Math.max(0, store.freeShippingThreshold - discounted),
    coupon: couponApplied,
    couponRejected: coupon && !couponApplied ? `Spend ${store.currency} ${coupon.minSubtotal?.toLocaleString("en-PK")} to use this code` : null,
    credits: appliedCredits,
    totalBeforeCredits: discounted + shipping,
    total: due,
  };
}

export const money = (n, cur = "Rs") => `${cur} ${Math.round(n).toLocaleString("en-PK")}`;
