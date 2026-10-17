// Cart pricing shared by the browser and the server, so the total a shopper
// sees is exactly the total the server charges.

export const isSuit = (p) => p && p.category !== "accessory";

export function priceCart(lines, byId, store, coupon = null) {
  const items = [];
  for (const l of lines) {
    const p = byId[l.id];
    const qty = Math.max(1, Math.min(10, Math.floor(Number(l.qty) || 1)));
    if (!p) continue;
    items.push({ id: p.id, slug: p.slug, title: p.title, image: p.images[0], size: l.size, qty, unit: p.price, compareAt: p.compareAt || null, line: p.price * qty, suit: isSuit(p) });
  }
  const subtotal = items.reduce((s, i) => s + i.line, 0);
  const suitQty = items.filter((i) => i.suit).reduce((s, i) => s + i.qty, 0);
  const suitSub = items.filter((i) => i.suit).reduce((s, i) => s + i.line, 0);
  const accSub = subtotal - suitSub;
  const discounts = [];

  const tier = [...(store.multiBuy || [])].sort((a, b) => a.minItems - b.minItems).filter((t) => suitQty >= t.minItems).pop();
  if (tier) discounts.push({ key: "multibuy", label: `Buy ${tier.minItems}+ suits: ${tier.percent}% off`, amount: Math.round((suitSub * tier.percent) / 100) });
  if (suitQty > 0 && accSub > 0 && store.bundle) discounts.push({ key: "bundle", label: `${store.bundle.label}: ${store.bundle.percent}% off accessories`, amount: Math.round((accSub * store.bundle.percent) / 100) });

  const afterAuto = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  let couponApplied = null;
  if (coupon && coupon.type === "percent" && (!coupon.minSubtotal || afterAuto >= coupon.minSubtotal)) {
    const amount = Math.round((afterAuto * coupon.value) / 100);
    discounts.push({ key: "coupon", label: coupon.label, amount });
    couponApplied = coupon.code;
  }
  const discounted = subtotal - discounts.reduce((s, d) => s + d.amount, 0);
  const freeByCoupon = coupon && coupon.type === "freeship";
  if (freeByCoupon) couponApplied = coupon.code;
  const freeShip = freeByCoupon || discounted >= store.freeShippingThreshold;
  const shipping = items.length === 0 || freeShip ? 0 : store.shippingFee;
  return {
    items,
    count: items.reduce((s, i) => s + i.qty, 0),
    suitQty,
    subtotal,
    discounts,
    savings: discounts.reduce((s, d) => s + d.amount, 0) + items.reduce((s, i) => s + (i.compareAt ? (i.compareAt - i.unit) * i.qty : 0), 0),
    shipping,
    freeShippingRemaining: freeShip ? 0 : Math.max(0, store.freeShippingThreshold - discounted),
    coupon: couponApplied,
    couponRejected: coupon && !couponApplied ? `Spend ${store.currency} ${coupon.minSubtotal?.toLocaleString("en-PK")} to use this code` : null,
    total: discounted + shipping,
  };
}

export const money = (n, cur = "Rs") => `${cur} ${Math.round(n).toLocaleString("en-PK")}`;
