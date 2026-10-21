// Quick view, sharing and WhatsApp ordering.
//   card extra   an eye button on every product card opens a quick-view modal
//                (gallery, sizes, qty, add to bag, wishlist) without leaving the page
//   pdp-actions  a share row: native share sheet, WhatsApp, Facebook, copy link
//   cart-extras  "Order this bag on WhatsApp" with every line of the bag spelled out
import { $, $$, esc, rs, img, icon, state, ext, toast, openOverlay, addToCart, flyToCart, toggleWish, fillSlots, badges, stars, typeLabel, stockLeft, registerCardExtra, registerSlot } from "../core.js";

// lucide "share-2" (ISC) drawn with the same attributes as core icons
const shareIcon = (size = 18) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></svg>`;

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const productUrl = (p) => `${location.origin}/product/${p.slug}`;
const shareText = (p) => `${p.title}${p.urdu ? ` (${p.urdu})` : ""} · ${rs(p.price)} at Aarzu`;
const waNumber = () => String(state.store?.contact?.whatsapp || "").replace(/\D/g, "");
const bump = () => { const b = $("#bag-count"); b?.classList.remove("bump"); void b?.offsetWidth; b?.classList.add("bump"); };
const pop = (el) => { el.classList.remove("qv-pop"); void el.offsetWidth; el.classList.add("qv-pop"); };

// Missing photos fall back to the stage's Urdu watermark instead of a broken-image icon.
function softenBroken(root) {
  $$("img", root).forEach((im) => {
    const bad = () => im.classList.add("qv-broken");
    im.addEventListener("error", bad, { once: true });
    if (im.complete && im.getAttribute("src") && !im.naturalWidth) bad();
  });
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
  document.body.append(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  return ok;
}

// ------------------------------------------------------------------ share row
function shareRow(p, { compact = false, k } = {}) {
  const url = productUrl(p);
  const native = typeof navigator.share === "function";
  return `<div class="qv-share ${compact ? "compact" : ""}" role="group" aria-label="Share this piece" ${k != null ? `style="--k:${k}"` : ""}>
    <span class="qv-share-l">Share<span class="ur">شیئر کریں</span></span><span class="qv-share-line" aria-hidden="true"></span>
    <div class="qv-share-btns">
      ${native ? `<button type="button" class="qv-sbtn is-native" data-share-native="${esc(p.id)}" aria-label="Share" title="Share">${shareIcon(compact ? 16 : 18)}</button>` : ""}
      <a class="qv-sbtn is-wa" href="https://wa.me/?text=${esc(encodeURIComponent(`${shareText(p)}\n${url}`))}" target="_blank" rel="noopener" aria-label="Share on WhatsApp" title="WhatsApp">${icon("whatsapp", "", compact ? 17 : 19)}</a>
      <a class="qv-sbtn is-fb" href="https://www.facebook.com/sharer/sharer.php?u=${esc(encodeURIComponent(url))}" target="_blank" rel="noopener" aria-label="Share on Facebook" title="Facebook">${icon("facebook", "", compact ? 16 : 18)}</a>
      <button type="button" class="qv-sbtn is-copy" data-share-copy="${esc(p.id)}" aria-label="Copy link" title="Copy link">${icon("copy", "", compact ? 15 : 17)}</button>
    </div></div>`;
}

async function onShareClick(e) {
  const n = e.target.closest("[data-share-native]");
  if (n) {
    const p = state.byId[n.dataset.shareNative];
    if (!p) return;
    try { await navigator.share({ title: `${p.title} · Aarzu`, text: shareText(p), url: productUrl(p) }); }
    catch (err) { if (err?.name !== "AbortError") copyLink(p, null); }
    return;
  }
  const c = e.target.closest("[data-share-copy]");
  if (c && state.byId[c.dataset.shareCopy]) copyLink(state.byId[c.dataset.shareCopy], c);
}

async function copyLink(p, btn) {
  if (!(await copyText(productUrl(p)))) return toast("Couldn't copy the link. Long-press the address bar instead", { icon: "x" });
  toast("Link copied. Paste it anywhere to share", { icon: "copy" });
  if (!btn) return;
  const was = btn.innerHTML;
  btn.classList.add("done");
  btn.innerHTML = icon("check", "", 17);
  setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = was; }, 1800);
}

// ------------------------------------------------------------------ quick view
function openQuickView(p, opener) {
  const s = state.store;
  const sizes = p.sizes || [];
  const imgs = p.images?.length ? p.images : [""];
  const left = (z) => p.stock?.[z] ?? 0;
  const total = stockLeft(p);
  const save = p.compareAt > p.price ? p.compareAt - p.price : 0;
  const wished = state.wish.includes(p.id);
  const keyboard = opener?.matches?.(":focus-visible");
  let size = sizes.length === 1 ? sizes[0] : null, qty = 1, active = 0, addedT = 0;
  const k = (n) => `style="--k:${n}"`;
  const addLabel = total ? `${icon("shopping-bag", "", 18)}<span>Add to bag</span>` : `<span>Sold out</span>`;

  const html = `<div class="qv" tabindex="-1" aria-label="Quick view: ${esc(p.title)}">
    <span class="qv-grab" aria-hidden="true"></span>
    <div class="qv-gallery">
      <div class="qv-stage" data-ur="${esc(p.urdu || "آرزو")}">
        <div class="qv-track">${imgs.map((u, i) => `<figure class="qv-slide"><img src="${esc(img(u))}" alt="${i ? "" : esc(p.title)}" ${i ? `loading="lazy"` : ""} referrerpolicy="no-referrer" draggable="false"></figure>`).join("")}</div>
        ${badges(p)}
        ${imgs.length > 1 ? `<button type="button" class="qv-nav prev" data-qv-step="-1" aria-label="Previous image">${icon("chevron-left", "", 20)}</button>
          <button type="button" class="qv-nav next" data-qv-step="1" aria-label="Next image">${icon("chevron-right", "", 20)}</button>
          <div class="qv-thumbs">${imgs.map((u, i) => `<button type="button" class="${i ? "" : "on"}" data-qv-img="${i}" aria-label="Show image ${i + 1}"><img src="${esc(img(u))}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`).join("")}</div>
          <div class="qv-dots" aria-hidden="true">${imgs.map((_, i) => `<button type="button" class="${i ? "" : "on"}" data-qv-img="${i}" tabindex="-1"></button>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="qv-info">
      <div class="qv-eyebrow" ${k(0)}><span class="eyebrow">Quick view</span><span class="ur">ایک نظر</span></div>
      <div class="qv-kicker" ${k(1)}><span>${esc(typeLabel(p))}</span>${p.fabric ? `<i>·</i><span>${esc(p.fabric)}</span>` : ""}${p.region ? `<i>·</i><span>${esc(p.region)}</span>` : ""}</div>
      <h2 class="qv-title" ${k(2)}>${esc(p.title)}${p.urdu ? `<span class="ur">${esc(p.urdu)}</span>` : ""}</h2>
      ${p.rating ? `<div class="qv-rating" ${k(3)}>${stars(p.rating)}</div>` : ""}
      <div class="qv-price" ${k(3)}><b>${rs(p.price)}</b>${save ? `<s>${rs(p.compareAt)}</s><span class="chip qv-save">${icon("badge-percent", "", 14)} Save ${rs(save)}</span>` : ""}</div>
      ${sizes.length > 1 ? `<div class="qv-sizes" ${k(4)}><div class="opt-label"><span>Size: <span data-qv-szl>choose</span></span><a href="/size-guide" data-link>Size guide</a></div>
        <div class="sizes">${sizes.map((z) => `<button type="button" data-qv-sz="${esc(z)}" ${left(z) > 0 ? "" : `disabled aria-label="${esc(z)}, sold out"`}>${esc(z)}</button>`).join("")}</div></div>` : ""}
      <div class="qv-stock" data-qv-stock ${k(5)}></div>
      <div data-slot="pdp-options" data-pid="${esc(p.id)}" data-context="quickview" ${k(5)}></div>
      <div class="buy-row qv-buy" ${k(6)}>
        <div class="qty"><button type="button" data-qv-qty="-1" aria-label="Less">${icon("minus", "", 16)}</button><span data-qv-q aria-live="polite">1</span><button type="button" data-qv-qty="1" aria-label="More">${icon("plus", "", 16)}</button></div>
        <button type="button" class="btn rani" data-qv-add ${total ? "" : "disabled"}>${addLabel}</button>
      </div>
      <div class="qv-total" data-qv-total hidden></div>
      <div class="qv-sub" ${k(7)}>
        <button type="button" class="qv-wish ${wished ? "on" : ""}" data-qv-wish aria-pressed="${wished}">${icon("heart", "", 17)}<span>${wished ? "In your wishlist" : "Save to wishlist"}</span></button>
        <a class="link under" href="/product/${esc(p.slug)}" data-link>View full details ${icon("arrow-right", "", 15)}</a>
      </div>
      <div class="trust-mini qv-trust" ${k(8)}><span>${icon("banknote", "", 14)} Cash on delivery</span><span>${icon("refresh-ccw", "", 14)} ${esc(s.returnDays)}-day exchange</span><span>${icon("truck", "", 14)} Free delivery over ${rs(s.freeShippingThreshold)}</span></div>
      ${shareRow(p, { compact: true, k: 9 })}
    </div>
  </div>`;

  const onKey = (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); show(active + (e.key === "ArrowRight" ? 1 : -1)); }
  };
  const el = openOverlay(html, {
    width: 940, cls: "qv-modal",
    onClose: () => { removeEventListener("keydown", onKey); clearTimeout(addedT); if (keyboard && opener?.isConnected) opener.focus({ preventScroll: true }); },
  });
  addEventListener("keydown", onKey);
  softenBroken(el);
  fillSlots(el, { pid: p.id });
  requestAnimationFrame(() => $(".qv", el)?.focus({ preventScroll: true }));

  // gallery: a scroll-snap track, so touch swipe is native; arrows, thumbs, dots and keys drive it too
  const track = $(".qv-track", el);
  const mark = () => $$("[data-qv-img]", el).forEach((b) => b.classList.toggle("on", Number(b.dataset.qvImg) === active));
  const show = (i) => {
    if (imgs.length < 2) return;
    active = (i + imgs.length) % imgs.length;
    track.scrollTo({ left: active * track.clientWidth, behavior: reduced() ? "auto" : "smooth" });
    mark();
  };
  track.addEventListener("scroll", () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i !== active) { active = i; mark(); }
  }, { passive: true });

  // stock, size and quantity
  const stockUi = () => {
    const n = size ? left(size) : total, perSize = size && sizes.length > 1;
    const box = $("[data-qv-stock]", el);
    box.className = `qv-stock ${n === 0 ? "out" : n <= 5 ? "low" : "ok"}`;
    box.innerHTML = n === 0 ? `${icon("clock", "", 15)}<span>Sold out for now. <a href="/product/${esc(p.slug)}" data-link>See details</a></span>`
      : n <= 5 ? `${icon("flame", "", 15)}<span>Only <b>${n} left</b>${perSize ? ` in ${esc(size)}` : ""}</span>`
      : `${icon("circle-check", "", 15)}<span>In stock, ready to dispatch</span>`;
  };
  const maxQty = () => Math.max(1, Math.min(10, size ? left(size) : 10));
  const setQty = (n) => {
    qty = Math.max(1, Math.min(maxQty(), n));
    $("[data-qv-q]", el).textContent = qty;
    const t = $("[data-qv-total]", el);
    t.hidden = qty < 2;
    t.innerHTML = `${qty} × ${rs(p.price)} = <b>${rs(qty * p.price)}</b>`;
  };
  const setSize = (z) => {
    size = z;
    $$("[data-qv-sz]", el).forEach((b) => b.classList.toggle("on", b.dataset.qvSz === z));
    const l = $("[data-qv-szl]", el);
    if (l) l.textContent = z;
    setQty(qty);
    stockUi();
  };
  stockUi();

  const add = () => {
    if (!size) {
      const sz = $(".sizes", el);
      sz?.classList.remove("shake"); void sz?.offsetWidth; sz?.classList.add("shake");
      return toast("Please choose your size first", { icon: "ruler" });
    }
    if (left(size) < qty) return toast(`Only ${left(size)} left in ${esc(size)}`);
    // Same add-on/meta hooks as the product page (e.g. stitching chosen in the pdp-options slot).
    // A deliberate Error blocks the add with its message; a crash in a feature is skipped.
    const extra = { addons: [], meta: undefined };
    for (const fn of ext.lineOptions) {
      let o;
      try { o = fn(p, el) || {}; }
      catch (err) {
        if (err instanceof TypeError) { console.warn("[quickview] line option skipped:", err); continue; }
        return toast(esc(err.message), { icon: "x" });
      }
      if (o.addons) extra.addons.push(...o.addons);
      if (o.meta) extra.meta = { ...(extra.meta || {}), ...o.meta };
    }
    if (!addToCart(p.id, size, qty, extra)) return;
    const im = $$(".qv-slide img", el)[active];
    if (im?.naturalWidth) flyToCart(im); else bump();
    toast(`<b>${esc(p.title)}</b> added to your bag`, { img: p.images[0], action: "View bag", actionData: "open-cart", href: "#" });
    const btn = $("[data-qv-add]", el);
    btn.classList.add("qv-added");
    btn.innerHTML = `${icon("check", "", 18)}<span>Added to bag</span>`;
    clearTimeout(addedT);
    addedT = setTimeout(() => { btn.classList.remove("qv-added"); btn.innerHTML = addLabel; }, 1800);
  };

  const wish = (b) => {
    const onNow = toggleWish(p.id);
    b.classList.toggle("on", onNow);
    b.setAttribute("aria-pressed", onNow);
    $("span", b).textContent = onNow ? "In your wishlist" : "Save to wishlist";
    pop(b);
    // keep the heart on the card behind the modal in sync
    $$(`.wish[data-wish="${CSS.escape(p.id)}"]`).forEach((h) => { h.classList.toggle("on", onNow); h.setAttribute("aria-pressed", String(onNow)); h.setAttribute("aria-label", `${onNow ? "Remove from" : "Add to"} wishlist`); });
    toast(onNow ? "Saved to your wishlist" : "Removed from wishlist", { icon: "heart", action: onNow ? "View" : null, href: "/wishlist" });
  };

  el.addEventListener("click", (e) => {
    const t = e.target;
    const st = t.closest("[data-qv-step]"); if (st) return show(active + Number(st.dataset.qvStep));
    const th = t.closest("[data-qv-img]"); if (th) return show(Number(th.dataset.qvImg));
    const sz = t.closest("[data-qv-sz]"); if (sz) return setSize(sz.dataset.qvSz);
    const qd = t.closest("[data-qv-qty]");
    if (qd) {
      const want = qty + Number(qd.dataset.qvQty);
      if (size && want > left(size) && want <= 10) toast(`Only ${left(size)} left in ${esc(size)}`, { icon: "flame" });
      return setQty(want);
    }
    if (t.closest("[data-qv-add]")) return add();
    const w = t.closest("[data-qv-wish]"); if (w) return wish(w);
  });
  return el;
}

// ------------------------------------------------------------------ WhatsApp order for the whole bag
function bagMessage(q) {
  const lines = q.items.map((i, n) => {
    const extras = [...(i.addons || []).map((a) => `${a.label} +${rs(a.price)}`), i.meta?.summary].filter(Boolean).join(" · ");
    return [
      `${n + 1}) *${i.title}*`,
      `Size: ${i.size} · Qty: ${i.qty}`,
      extras && `Add-ons: ${extras}`,
      `Line total: ${rs(i.line)}`,
      `${location.origin}/product/${i.slug}`,
    ].filter(Boolean).join("\n");
  });
  const sums = [
    `Subtotal: ${rs(q.subtotal)}`,
    ...q.discounts.map((d) => `${d.label}: −${rs(d.amount)}`),
    `Delivery: ${q.shipping ? rs(q.shipping) : "FREE"}`,
    ...q.credits.map((c) => `${c.label}: −${rs(c.amount)}`),
    `*Bag total: ${rs(q.total)}*`,
    q.coupon ? `Code used: ${q.coupon}` : "",
  ].filter(Boolean);
  return [
    "Assalam o Alaikum Aarzu! I'd like to order this bag:", "",
    lines.join("\n\n"), "",
    ...sums, "",
    "I'll pay cash on delivery. My details:",
    "Name:", "City:", "Address:",
  ].join("\n");
}

function cartWhatsApp(el, { quote: q }) {
  const wa = waNumber();
  if (!q?.items?.length || !wa) return;
  const href = `https://wa.me/${wa}?text=${encodeURIComponent(bagMessage(q))}`;
  el.insertAdjacentHTML("beforeend", `<div class="qv-wa-order">
    <div class="qv-wa-h"><span>Prefer to order on chat?</span><span class="ur">واٹس ایپ پر آرڈر</span></div>
    <a class="qv-wa-btn" href="${esc(href)}" target="_blank" rel="noopener">${icon("whatsapp", "", 22)}<span>Order this bag on WhatsApp</span></a>
    <p class="qv-wa-note">${icon("banknote", "", 15)}<span>One message with your ${q.count} item${q.count === 1 ? "" : "s"}, sizes and the <b>${rs(q.total)}</b> total. Cash on Delivery checkout is also available <a href="/checkout" data-link data-close>right here</a>.</span></p>
  </div>`);
}

// ------------------------------------------------------------------ init
export async function init() {
  registerCardExtra((p) => `<button type="button" class="qv-eye" data-qv="${esc(p.id)}" aria-label="Quick view: ${esc(p.title)}"><span class="qv-tip" aria-hidden="true">Quick view</span>${icon("eye", "", 18)}</button>`);

  // Capture phase so the card's links and quick-add never see this click.
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-qv]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    const p = state.byId[b.dataset.qv];
    if (p) openQuickView(p, b);
  }, true);
  document.addEventListener("click", onShareClick);

  registerSlot("pdp-actions", (el, d) => {
    const p = state.byId[d.pid];
    if (p) el.insertAdjacentHTML("beforeend", shareRow(p));
  });
  registerSlot("cart-extras", cartWhatsApp);
}
