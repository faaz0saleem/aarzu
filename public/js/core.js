// Shared state, helpers, animations and UI pieces for the Aarzu storefront.
import { icon } from "./icons.js";
import { priceCart, money, lineKey } from "./pricing.js";

export { icon, money };

// ------------------------------------------------------------------ helpers
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const rs = (n) => money(n, state.store?.currency || "Rs");
export const img = (u) => (u && /^https?:/.test(u) ? `/img?u=${encodeURIComponent(u)}` : u || "");
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const sid = load("az_sid", null) || (() => { const s = Math.random().toString(36).slice(2) + Date.now().toString(36); save("az_sid", s); return s; })();

export async function api(path, body, method, headers = {}) {
  const r = await fetch(path, { method: method || (body ? "POST" : "GET"), headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => null);
  if (!data || typeof data !== "object") throw Object.assign(new Error(path.startsWith("/api/admin/") ? "The admin API is unavailable. Check that the PHP site files are installed for this domain." : "The store could not complete this request. Please try again."), { status: r.status });
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong"), { data, status: r.status });
  return data;
}

// ------------------------------------------------------------------ state
const listeners = new Set();
export const state = {
  products: [], media: [], store: null, byId: {}, bySlug: {}, lastOrder: null,
  cart: load("az_cart", []), wish: load("az_wish", []), recent: load("az_recent", []), coupon: load("az_coupon", null),
  credits: load("az_credits", []),
};

// ------------------------------------------------------------------ feature extension points
// Feature modules in public/js/features/ register into these. See features/index.js.
export const ext = { cardExtras: [], slots: {}, links: [], adminTabs: [], lineOptions: [], routes: [], headerTools: [], routeHooks: [] };
export const registerCardExtra = (fn) => ext.cardExtras.push(fn); // fn(product) -> html inside every product card
export const registerSlot = (name, fn) => (ext.slots[name] ||= []).push(fn); // fn(el, data) fills <div data-slot="name">
export const registerLink = (link) => ext.links.push(link); // { where: "shop"|"help"|"aarzu"|"menu", label, href }
export const registerAdminTab = (tab) => ext.adminTabs.push(tab); // { key, label, render(el, call) }
export const registerLineOption = (fn) => ext.lineOptions.push(fn); // fn(product, pageEl) -> { addons?, meta? }; throw Error(msg) to block add
export const registerRoute = (re, fn) => ext.routes.push([re, fn]); // fn(view, ctx) like core pages
export const registerHeaderTool = (fn) => ext.headerTools.push(fn); // fn() -> html placed before the search icon
export const registerRouteHook = (fn) => ext.routeHooks.push(fn); // fn(url, view) after every page render
export function fillSlots(root, data = {}) {
  $$("[data-slot]", root).forEach((el) => {
    if (el.dataset.filled) return;
    el.dataset.filled = "1";
    for (const fn of ext.slots[el.dataset.slot] || []) {
      try { fn(el, { ...data, ...el.dataset }); } catch (e) { console.error(`[slot ${el.dataset.slot}]`, e); }
    }
  });
}
export let navigate = (href) => { location.href = href; };
export function setNavigate(fn) { navigate = fn; }
export const listed = () => state.products.filter((p) => !p.unlisted);
// Add-on labels (e.g. stitching) and a feature-provided meta.summary under each bag/checkout line
export const lineExtras = (i) => (i.addons?.length || i.meta?.summary ? `<div class="m line-extra">${[...(i.addons || []).map((a) => `${esc(a.label)} +${rs(a.price)}`), i.meta?.summary ? esc(i.meta.summary) : ""].filter(Boolean).join(" · ")}</div>` : "");
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (what) => listeners.forEach((fn) => fn(what));

export async function boot() {
  const d = await api("/api/catalog");
  state.products = d.products;
  state.media = d.media || [];
  state.store = d.store;
  state.byId = Object.fromEntries(d.products.map((p) => [p.id, p]));
  state.bySlug = Object.fromEntries(d.products.map((p) => [p.slug, p]));
  const previous = Array.isArray(state.cart) ? state.cart : [];
  state.cart = [];
  for (const line of previous) {
    if (!line || !state.byId[line.id]?.sizes.includes(line.size)) continue;
    const key = lineKey(line), existing = state.cart.find(l => lineKey(l) === key);
    const qty = Math.min(Math.max(0, Math.floor(Number(line.qty) || 0)), 10 - Number(existing?.qty || 0), cartRoom(line.id, line.size));
    if (qty > 0) {
      if (existing) existing.qty += qty;
      else state.cart.push({ ...line, qty });
    }
  }
  if (JSON.stringify(state.cart) !== JSON.stringify(previous)) {
    save("az_cart", state.cart);
    toast("Your bag was updated to match the available stock.");
  }
}

export const quote = () => priceCart(state.cart, state.byId, state.store, state.coupon, { credits: state.credits });
// Stock is shared by every line of the same item/size, including different add-ons.
export function cartRoom(id, size, exceptKey) {
  const p = state.byId[id], stock = Number(p?.stock?.[size]);
  if (!p?.sizes.includes(size) || !Number.isFinite(stock)) return 0;
  const used = state.cart.filter(l => l.id === id && l.size === size && (exceptKey === undefined || lineKey(l) !== exceptKey)).reduce((sum, l) => sum + Number(l.qty || 0), 0);
  return Math.max(0, Math.floor(stock) - used);
}
// extra = { addons: [{ key, option }], meta: {...} } — lines with different extras stay separate
export function addToCart(id, size, qty = 1, extra = {}) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) { toast("Please choose a quantity from 1 to 10."); return false; }
  const line = { id, size, qty, ...(extra.addons?.length ? { addons: extra.addons } : {}), ...(extra.meta ? { meta: extra.meta } : {}) };
  const key = lineKey(line);
  const l = state.cart.find((x) => lineKey(x) === key);
  const wanted = Number(l?.qty || 0) + qty;
  if (wanted > Math.min(10, cartRoom(id, size, key))) {
    const available = Math.min(10 - Number(l?.qty || 0), cartRoom(id, size));
    toast(available > 0 ? `You can add ${available} more of this option.` : "This option has reached its limit in your bag or is sold out.");
    return false;
  }
  if (l) l.qty = wanted;
  else state.cart.push(line);
  save("az_cart", state.cart);
  emit("cart");
  return true;
}
export function setQty(key, qty) {
  const line = state.cart.find(l => lineKey(l) === key);
  if (!line || !Number.isInteger(qty) || qty < 0 || qty > 10) return false;
  if (qty > Math.min(10, cartRoom(line.id, line.size, key))) { toast("That quantity is unavailable. Check the stock for this option."); return false; }
  state.cart = state.cart.map((l) => (lineKey(l) === key ? { ...l, qty } : l)).filter((l) => l.qty > 0);
  save("az_cart", state.cart);
  emit("cart");
  return true;
}
export function clearCart() { state.cart = []; save("az_cart", []); emit("cart"); }
// credit = { key, label, amount, payload } (gift card, reward points ...); null removes it
export function setCredit(key, credit) {
  state.credits = state.credits.filter((c) => c.key !== key).concat(credit ? [{ ...credit, key }] : []);
  save("az_credits", state.credits);
  emit("cart");
}
export function toggleWish(id) {
  state.wish = state.wish.includes(id) ? state.wish.filter((x) => x !== id) : [id, ...state.wish];
  save("az_wish", state.wish);
  emit("wish");
  return state.wish.includes(id);
}
export function pushRecent(id) { state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 12); save("az_recent", state.recent); }
export function setCoupon(c) { state.coupon = c; save("az_coupon", c); emit("cart"); }

// ------------------------------------------------------------------ product helpers
export const stockLeft = (p) => Object.values(p.stock || {}).reduce((s, n) => s + n, 0);
export const isNew = (p) => Date.now() - Date.parse(p.createdAt || 0) < 30 * 864e5;
export const firstSize = (p) => p.sizes.find((s) => (p.stock?.[s] ?? 0) > 0);
export const typeLabel = (p) => (p.category === "accessory" ? (p.accessoryType || "Accessory") : p.category === "unstitched" ? `Unstitched · ${p.pieces}-Piece` : `Ready to Wear · ${p.pieces}-Piece`);
const COLORS = { red: "#B3122E", maroon: "#7A1530", pink: "#E43F7B", blue: "#1C3F94", navy: "#1E2B4A", indigo: "#1D2A5B", teal: "#0F7C80", green: "#2E7D4F", emerald: "#0B5D4B", olive: "#5E6B3A", mint: "#BFE3D3", yellow: "#F2C14E", mustard: "#E9A825", orange: "#F26B1D", white: "#F7F3EA", ivory: "#F3EDE1", black: "#16151A", charcoal: "#3B3F45", grey: "#8B8F96", gray: "#8B8F96", beige: "#D8C3A0", sand: "#D8C3A0", brown: "#6B3F22", purple: "#6A3D9A", lilac: "#B9A3D9", peach: "#F6B99B", gold: "#C9A24A", multi: "conic-gradient(#D6246E,#F2A900,#0FA3A3,#1C2A6B,#D6246E)" };
export const colorCss = (c) => COLORS[String(c).toLowerCase().split(/[\s/]/).pop()] || COLORS[String(c).toLowerCase().split(/[\s/]/)[0]] || "#ccc";

export function stars(r, n = true) {
  if (!r) return "";
  const full = Math.round(r.avg);
  return `<span class="stars">${"★".repeat(full)}${"☆".repeat(5 - full)}${n ? `<span class="n">${r.avg} (${r.count})</span>` : ""}</span>`;
}

export function badges(p) {
  const b = [];
  if (p.collection === "originals") b.push(`<span class="badge orig">Aarzu Original</span>`);
  if (p.compareAt > p.price) b.push(`<span class="badge save">Save ${rs(p.compareAt - p.price)}</span>`);
  if (p.sold >= 5) b.push(`<span class="badge hot">Bestseller</span>`);
  else if (isNew(p)) b.push(`<span class="badge new">New in</span>`);
  const left = stockLeft(p);
  if (left > 0 && left <= 4) b.push(`<span class="badge low">Only ${left} left</span>`);
  if (left === 0) b.push(`<span class="badge">Sold out</span>`);
  return `<div class="badges">${b.slice(0, 3).join("")}</div>`;
}

export function card(p, opts = {}) {
  const wished = state.wish.includes(p.id);
  const alt = p.images[1];
  const unstitched = p.sizes.length === 1;
  return `<article class="card ${opts.arched ? "arched" : ""}" data-id="${p.id}" ${opts.reveal !== false ? `data-reveal style="--i:${opts.i || 0}"` : ""}>
    <div class="card-visual">
    <a class="card-media" href="/product/${p.slug}" data-link>
      <img class="main" src="${esc(img(p.images[0]))}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">
      ${alt ? `<img class="alt" src="${esc(img(alt))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}
      <span class="shine"></span>
      ${badges(p)}
    </a>
    <button type="button" class="wish ${wished ? "on" : ""}" data-wish="${p.id}" aria-pressed="${wished}" aria-label="${wished ? "Remove from" : "Add to"} wishlist">${icon("heart", "", 18)}</button>
    ${ext.cardExtras.map((fn) => { try { return fn(p) || ""; } catch { return ""; } }).join("")}
    <div class="quick">
      ${unstitched ? `<button type="button" class="btn rani sm" data-quick="${p.id}" data-size="${esc(p.sizes[0])}" ${stockLeft(p) ? "" : "disabled"}>${icon("shopping-bag", "", 16)}<span>${stockLeft(p) ? "Add to bag" : "Sold out"}</span></button>`
        : `<span class="lbl">Quick add · choose size</span>${p.sizes.map((s) => `<button class="sz" data-quick="${p.id}" data-size="${esc(s)}" ${(p.stock?.[s] ?? 0) > 0 ? "" : "disabled"}>${esc(s)}</button>`).join("")}`}
    </div>
    </div>
    <div class="card-info">
      <div class="card-meta"><span>${esc(typeLabel(p))}</span>${stars(p.rating, false)}</div>
      <a class="card-title" href="/product/${p.slug}" data-link>${esc(p.title)}${p.urdu ? `<span class="ur">${esc(p.urdu)}</span>` : ""}</a>
      <div class="price"><b>${rs(p.price)}</b>${p.compareAt > p.price ? `<s>${rs(p.compareAt)}</s><span class="off">−${Math.round((1 - p.price / p.compareAt) * 100)}%</span>` : ""}</div>
      ${p.sold >= 3 ? `<span class="sold-line">${p.sold} sold recently</span>` : ""}
    </div>
  </article>`;
}

export const skeletons = (n) => Array.from({ length: n }, () => `<div class="card card-skel"><div class="card-media"></div><div class="card-info"><i style="width:60%"></i><i style="width:85%"></i><i style="width:40%"></i></div></div>`).join("");

// ------------------------------------------------------------------ toasts, overlays
export function toast(msg, opts = {}) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${opts.img ? `<img src="${esc(img(opts.img))}" alt="">` : icon(opts.icon || "circle-check")}<span>${msg}</span>${opts.action ? `<a href="${opts.href || "#"}" data-${opts.actionData || "link"}>${opts.action}</a>` : ""}`;
  $("#toasts").append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, opts.ms || 3600);
}

let openLayer = null;
export function openOverlay(html, { kind = "modal", width, onClose, cls = "" } = {}) {
  closeOverlay();
  const host = $("#overlays");
  const bd = document.createElement("div");
  bd.className = "backdrop";
  const el = document.createElement("div");
  if (kind === "modal") {
    el.className = `modal ${cls}`;
    el.innerHTML = `<div class="modal-box" style="${width ? `--w:${width}px` : ""}" role="dialog" aria-modal="true"><button class="icon-btn modal-close" data-close aria-label="Close">${icon("x")}</button>${html}</div>`;
  } else {
    el.className = `${kind} ${cls}`;
    el.innerHTML = html;
  }
  host.append(bd, el);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => { bd.classList.add("on"); el.classList.add("on"); });
  const close = () => closeOverlay();
  bd.addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === el) close(); });
  openLayer = { bd, el, onClose };
  return el;
}
export function closeOverlay() {
  if (!openLayer) return;
  const { bd, el, onClose } = openLayer;
  openLayer = null;
  bd.classList.remove("on");
  el.classList.remove("on");
  document.body.style.overflow = "";
  setTimeout(() => { bd.remove(); el.remove(); }, 500);
  onClose?.();
}
document.addEventListener("keydown", (e) => e.key === "Escape" && closeOverlay());

// ------------------------------------------------------------------ animations
let io;
export function reveal(root = document) {
  io ||= new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  $$("[data-reveal]:not(.in)", root).forEach((el) => io.observe(el));
  $$("[data-count]:not(.counted)", root).forEach((el) => {
    el.classList.add("counted");
    const end = Number(el.dataset.count), t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1600); el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))).toLocaleString("en-PK") + (el.dataset.suffix || ""); if (k < 1) requestAnimationFrame(step); };
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { requestAnimationFrame(step); o.disconnect(); } }).observe(el);
  });
}

export function splitWords(text) {
  return text.split(" ").map((w, i) => `<span class="w"><span style="--d:${i}">${w}</span></span>`).join(" ");
}

export function flyToCart(fromImg) {
  const target = $("#bag-btn");
  if (!fromImg || !target) return;
  const a = fromImg.getBoundingClientRect(), b = target.getBoundingClientRect();
  const f = fromImg.cloneNode();
  f.className = "fly";
  Object.assign(f.style, { left: a.left + "px", top: a.top + "px", width: a.width + "px", height: a.height + "px" });
  document.body.append(f);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  f.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx * 0.6}px,${dy - 120}px) scale(.5) rotate(-8deg)`, opacity: 1, offset: 0.55 }, { transform: `translate(${dx}px,${dy}px) scale(.08) rotate(10deg)`, opacity: 0.4 }], { duration: 900, easing: "cubic-bezier(.5,0,.3,1)" }).onfinish = () => {
    f.remove();
    const bub = $("#bag-count");
    bub?.classList.remove("bump"); void bub?.offsetWidth; bub?.classList.add("bump");
  };
}

export function confetti(n = 160) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  c.className = "fx";
  document.body.append(c);
  const ctx = c.getContext("2d");
  const W = (c.width = innerWidth), H = (c.height = innerHeight);
  const cols = ["#D6246E", "#F2A900", "#0FA3A3", "#1C2A6B", "#F26B1D", "#0B5D4B", "#C9A24A"];
  const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4, r: Math.random() * 6 + 4, c: cols[(Math.random() * cols.length) | 0], a: Math.random() * 6, s: Math.random() > 0.5 }));
  let t = 0;
  (function f() {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += 0.15;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
      if (p.s) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); else { ctx.beginPath(); ctx.ellipse(0, 0, p.r / 2, p.r / 1.2, 0, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    if (++t < 200) requestAnimationFrame(f); else c.remove();
  })();
}

export function petals(canvas) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const ctx = canvas.getContext("2d");
  let W, H, run = true;
  const size = () => { W = canvas.width = canvas.offsetWidth; H = canvas.height = canvas.offsetHeight; };
  size();
  addEventListener("resize", size);
  const cols = ["#F26B1D", "#F2A900", "#E43F7B", "#FFD23F", "#ffffff"];
  const ps = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 4 + Math.random() * 6, s: 0.4 + Math.random() * 0.9, a: Math.random() * 6, w: Math.random() * 0.03 + 0.01, c: cols[(Math.random() * cols.length) | 0] }));
  (function f() {
    if (!run) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.y += p.s; p.a += p.w; p.x += Math.sin(p.a) * 0.8;
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a * 2); ctx.globalAlpha = 0.75; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r / 2, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    requestAnimationFrame(f);
  })();
  return () => { run = false; removeEventListener("resize", size); };
}

export function countdown(el, endsAt) {
  const tick = () => {
    if (!el.isConnected) return clearInterval(t);
    let s = Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000));
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    el.innerHTML = [[d, "days"], [h, "hrs"], [m, "min"], [s, "sec"]].map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><i>${l}</i></div>`).join("");
  };
  tick();
  const t = setInterval(tick, 1000);
}

// Delivery promise from the store's real dispatch cut-off (Mon–Sat, PKT).
export function dispatchInfo(cityName) {
  const s = state.store;
  const pk = new Date(Date.now() + (5 * 60 + new Date().getTimezoneOffset()) * 60000);
  const cut = new Date(pk); cut.setHours(s.dispatchCutoffHour, 0, 0, 0);
  const sameDay = pk.getDay() !== 0 && pk < cut;
  const city = s.cities.find((c) => c.name === cityName) || s.cities[0];
  const [lo, hi] = city.days.split("–").map(Number);
  const start = new Date(pk); if (!sameDay) start.setDate(start.getDate() + (pk.getDay() === 6 && pk >= cut ? 2 : 1));
  const add = (n) => { const d = new Date(start); d.setDate(d.getDate() + n); return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); };
  const left = Math.max(0, cut - pk), hh = Math.floor(left / 36e5), mm = Math.floor((left % 36e5) / 6e4);
  return { sameDay, eta: `${add(lo)} – ${add(hi || lo)}`, left: `${hh}h ${mm}m`, city: city.name };
}

// Cart actions on any product card
export function cardActions(root) {
  root.addEventListener("click", (e) => {
    const w = e.target.closest("[data-wish]");
    if (w) {
      e.preventDefault();
      const onNow = toggleWish(w.dataset.wish);
      $$("[data-wish]").filter(b => b.dataset.wish === w.dataset.wish).forEach(b => {
        b.classList.toggle("on", onNow);
        b.setAttribute("aria-pressed", String(onNow));
        b.setAttribute("aria-label", `${onNow ? "Remove from" : "Add to"} wishlist`);
      });
      w.classList.remove("pop"); void w.offsetWidth; w.classList.add("pop");
      toast(onNow ? "Saved to your wishlist" : "Removed from wishlist", { icon: "heart", action: onNow ? "View" : null, href: "/wishlist" });
      return;
    }
    const q = e.target.closest("[data-quick]");
    if (q) {
      e.preventDefault();
      if (q.disabled) return;
      const p = state.byId[q.dataset.quick];
      if (!p || !addToCart(p.id, q.dataset.size)) return;
      flyToCart(q.closest(".card")?.querySelector("img.main"));
      toast(`<b>${esc(p.title)}</b> added to your bag`, { img: p.images[0], action: "View bag", actionData: "open-cart", href: "#" });
    }
  });
}
