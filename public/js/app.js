// Aarzu storefront: layout, router, cart drawer, search, spin wheel.
import { $, $$, esc, rs, img, icon, api, state, on, boot, quote, setQty, setCoupon, addToCart, card, toast, openOverlay, closeOverlay, reveal, confetti, cardActions, sid } from "./core.js";
import { routes } from "./pages.js";

const BUNTING = ["#D6246E", "#F2A900", "#0FA3A3", "#F26B1D", "#1C2A6B", "#0B5D4B", "#E43F7B", "#FFD23F"];
const bunting = (n = 64) => `<div class="bunting-row">${Array.from({ length: n }, (_, i) => `<i style="--n:${i};background:${BUNTING[i % BUNTING.length]}"></i>`).join("")}</div>`;

// ------------------------------------------------------------------ layout
function announce() {
  const s = state.store;
  const msgs = [
    `${icon("truck", "", 15)} Free delivery on orders over <b>${rs(s.freeShippingThreshold)}</b>`,
    `${icon("banknote", "", 15)} Cash on delivery <b>all over Pakistan</b>`,
    Date.now() < Date.parse(s.launchOffer.endsAt) ? `${icon("sparkles", "", 15)} ${esc(s.launchOffer.headline)}: code <b>${s.launchOffer.code}</b>` : null,
    `${icon("refresh-ccw", "", 15)} Easy <b>${s.returnDays}-day</b> exchanges`,
  ].filter(Boolean);
  $("#announce").innerHTML = `<div class="announce"><div class="wrap"><div class="announce-msgs">${msgs.map((m, i) => `<span class="${i ? "" : "on"}">${m}</span>`).join("")}</div></div>${bunting()}</div>`;
  let i = 0;
  setInterval(() => {
    const els = $$(".announce-msgs span");
    els[i].classList.replace("on", "out");
    const prev = els[i];
    setTimeout(() => prev.classList.remove("out"), 700);
    i = (i + 1) % els.length;
    els[i].classList.add("on");
  }, 4200);
}

function header() {
  const pick = (f) => state.products.find(f);
  const wImg = pick((p) => p.gender === "women")?.images[0], mImg = pick((p) => p.gender === "men")?.images[0];
  const mega = (g, feat, label) => `<div class="mega"><div class="wrap">
      <div><h5>Unstitched</h5><ul><li><a href="/shop?gender=${g}&category=unstitched" data-link>All unstitched</a></li><li><a href="/shop?gender=${g}&category=unstitched&fabric=Lawn" data-link>Lawn</a></li><li><a href="/shop?gender=${g}&category=unstitched&fabric=Khaddar" data-link>Khaddar</a></li><li><a href="/shop?gender=${g}&pieces=3" data-link>3-Piece suits</a></li></ul></div>
      <div><h5>Ready to wear</h5><ul><li><a href="/shop?gender=${g}&category=ready-to-wear" data-link>All ready to wear</a></li><li><a href="/shop?gender=${g}&pieces=2" data-link>2-Piece sets</a></li><li><a href="/shop?gender=${g}&sort=new" data-link>New arrivals</a></li><li><a href="/shop?gender=${g}&sort=save" data-link>Best savings</a></li></ul></div>
      <div><h5>Collections</h5><ul><li><a href="/shop?gender=${g}&collection=originals" data-link>Aarzu Originals</a></li><li><a href="/shop?gender=${g}&collection=designer" data-link>Designer Edit</a></li><li><a href="/shop?gender=${g}&occasion=Eid" data-link>Eid Edit</a></li><li><a href="/shop?category=accessory" data-link>Dupattas & Shawls</a></li></ul></div>
      <a class="mega-feature" href="/shop?gender=${g}" data-link>${feat ? `<img src="${esc(img(feat))}" alt="" referrerpolicy="no-referrer">` : ""}<span>${label} →</span></a>
    </div></div>`;
  $("#header").className = "header";
  $("#header").innerHTML = `<div class="wrap">
    <div class="left" style="display:flex;align-items:center;gap:6px">
      <button class="icon-btn burger" id="burger" aria-label="Menu">${icon("menu")}</button>
      <nav class="nav" aria-label="Main">
        <div class="nav-item"><a href="/shop?gender=women" data-link data-nav="women">Women</a>${mega("women", wImg, "Shop all women")}</div>
        <div class="nav-item"><a href="/shop?gender=men" data-link data-nav="men">Men</a>${mega("men", mImg, "Shop all men")}</div>
        <div class="nav-item"><a href="/shop?collection=originals" data-link data-nav="originals">Originals</a></div>
        <div class="nav-item"><a href="/shop?category=accessory" data-link data-nav="accessory">Dupattas & Shawls</a></div>
        <div class="nav-item"><a href="/western" data-link data-nav="western">Western <span class="soon-pill">Soon</span></a></div>
      </nav>
    </div>
    <a class="logo" href="/" data-link aria-label="Aarzu home"><span class="ur">آرزو</span><span class="en">AARZU</span></a>
    <div class="tools">
      <button class="icon-btn" id="search-btn" aria-label="Search">${icon("search")}</button>
      <a class="icon-btn" href="/wishlist" data-link aria-label="Wishlist">${icon("heart")}<span class="bubble" id="wish-count" hidden></span></a>
      <button class="icon-btn" id="bag-btn" data-open-cart aria-label="Bag">${icon("shopping-bag")}<span class="bubble" id="bag-count" hidden></span></button>
    </div></div>`;
  let lastY = 0;
  addEventListener("scroll", () => {
    const y = scrollY;
    $("#header").classList.toggle("scrolled", y > 10);
    $("#header").classList.toggle("hide", y > 500 && y > lastY + 4);
    if (y < lastY - 4 || y < 500) $("#header").classList.remove("hide");
    lastY = y;
    const h = document.documentElement.scrollHeight - innerHeight;
    $("#progress").style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    $(".fab .top")?.classList.toggle("on", y > 900);
  }, { passive: true });
  $("#search-btn").onclick = openSearch;
  $("#burger").onclick = openMenu;
  counts();
}

function counts() {
  const n = state.cart.reduce((s, l) => s + l.qty, 0);
  const b = $("#bag-count"), w = $("#wish-count");
  b.hidden = !n; b.textContent = n;
  w.hidden = !state.wish.length; w.textContent = state.wish.length;
}

function footer() {
  const s = state.store, c = s.contact;
  $("#footer").className = "footer";
  $("#footer").innerHTML = `<div class="wrap top">
      <div class="brand"><div class="ur">آرزو</div><p>Shalwar kameez with the soul of Pakistan: designer favourites for less, and our own Originals inspired by the crafts of every province.</p>
        <div class="socials">${["instagram", "facebook", "tiktok", "youtube"].map((k) => `<a href="${esc(s.social[k])}" target="_blank" rel="noopener" aria-label="${k}">${icon(k, "", 18)}</a>`).join("")}</div></div>
      <div><h5>Shop</h5><ul><li><a href="/shop?gender=women" data-link>Women</a></li><li><a href="/shop?gender=men" data-link>Men</a></li><li><a href="/shop?collection=originals" data-link>Aarzu Originals</a></li><li><a href="/shop?category=accessory" data-link>Dupattas & Shawls</a></li><li><a href="/western" data-link>Western (coming soon)</a></li></ul></div>
      <div><h5>Help</h5><ul><li><a href="/track" data-link>Track your order</a></li><li><a href="/shipping" data-link>Delivery & exchanges</a></li><li><a href="/size-guide" data-link>Size guide</a></li><li><a href="/faq" data-link>FAQs</a></li><li><a href="/contact" data-link>Contact us</a></li></ul></div>
      <div><h5>Aarzu</h5><ul><li><a href="/about" data-link>Our story</a></li><li><a href="/shop?sort=new" data-link>New arrivals</a></li><li><a href="/wishlist" data-link>Wishlist</a></li><li><button data-spin class="link">Spin the wheel</button></li></ul></div>
      <div><h5>Talk to us</h5><ul><li>${icon("phone", "", 15)} ${esc(c.phone)}</li><li>${icon("mail", "", 15)} ${esc(c.email)}</li><li>${icon("map-pin", "", 15)} ${esc(c.address)}</li><li>${icon("clock", "", 15)} ${esc(c.hours)}</li></ul></div>
    </div>
    <div class="wrap bottom"><span>© ${new Date().getFullYear()} Aarzu · <span class="urdu">آپ کی آرزو، ہماری ذمہ داری</span></span><div class="pay"><span>Cash on Delivery</span><span>Bank Transfer</span><span>JazzCash</span><span>Easypaisa</span></div></div>`;
}

function fab() {
  const wa = state.store.contact.whatsapp;
  const el = document.createElement("div");
  el.className = "fab";
  el.innerHTML = `<button class="top" aria-label="Back to top">${icon("arrow-up")}</button>
    <button class="gift" data-spin aria-label="Spin the wheel"><span>${icon("gift", "", 22)}</span></button>
    <a class="wa" href="https://wa.me/${wa}?text=${encodeURIComponent("Assalam o Alaikum Aarzu! I have a question.")}" target="_blank" rel="noopener" aria-label="WhatsApp">${icon("whatsapp", "", 28)}</a>`;
  document.body.append(el);
  el.querySelector(".top").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------------ cart drawer
export function openCart() {
  const el = openOverlay(`<div class="drawer-head"><h3>Your Bag <small id="cart-n"></small></h3><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div><div class="drawer-body" id="cart-body"></div><div class="drawer-foot" id="cart-foot"></div>`, { kind: "drawer", onClose: () => off() });
  const render = () => renderCart(el);
  const off = on((w) => w === "cart" && render());
  render();
}

function renderCart(el) {
  const q = quote(), s = state.store;
  $("#cart-n", el).textContent = q.count ? `(${q.count})` : "";
  if (!q.items.length) {
    $("#cart-body", el).innerHTML = `<div class="empty-state"><div class="ur">خالی</div><h3>Your bag is empty</h3><p>Your next favourite shalwar kameez is waiting.</p><a class="btn rani" href="/shop" data-link data-close>Start shopping</a></div>`;
    $("#cart-foot", el).innerHTML = "";
    return;
  }
  const pct = Math.min(100, ((s.freeShippingThreshold - q.freeShippingRemaining) / s.freeShippingThreshold) * 100);
  const nextTier = (s.multiBuy || []).find((t) => q.suitQty < t.minItems);
  const accIds = new Set(q.items.map((i) => i.id));
  const ups = state.products.filter((p) => p.category === "accessory" && !accIds.has(p.id) && Object.values(p.stock).some((n) => n > 0)).slice(0, 6);
  $("#cart-body", el).innerHTML = `
    <div class="ship-meter ${q.freeShippingRemaining ? "" : "done"}">${q.freeShippingRemaining ? `<span>You're <b>${rs(q.freeShippingRemaining)}</b> away from <b>free delivery</b></span>` : `<span>🎉 You've unlocked <b>free delivery</b>!</span>`}
      <div class="b"><i style="width:${pct}%"></i><span class="truck" style="left:${pct}%">${icon("truck", "", 16)}</span></div></div>
    ${nextTier && q.suitQty > 0 ? `<div class="nudge" style="margin-bottom:12px">${icon("sparkles")}<span>Add <b>${nextTier.minItems - q.suitQty} more suit</b> and get <b>${nextTier.percent}% off</b> all suits.</span></div>` : ""}
    ${q.items.map((i) => `<div class="line-item"><a href="/product/${i.slug}" data-link data-close><img src="${esc(img(i.image))}" alt="" referrerpolicy="no-referrer"></a><div>
        <div class="t">${esc(i.title)}</div><div class="m">${esc(i.size)}${i.compareAt ? ` · <s>${rs(i.compareAt)}</s>` : ""}</div>
        <div class="r"><div class="qty sm"><button data-q="${i.id}|${esc(i.size)}|${i.qty - 1}" aria-label="Less">${icon("minus", "", 14)}</button><span>${i.qty}</span><button data-q="${i.id}|${esc(i.size)}|${i.qty + 1}" aria-label="More">${icon("plus", "", 14)}</button></div><b>${rs(i.line)}</b></div>
        <button class="rm" data-q="${i.id}|${esc(i.size)}|0">Remove</button></div></div>`).join("")}
    ${ups.length && q.suitQty ? `<div class="upsell"><h6>${icon("wand-sparkles", "", 13)} Complete the look · ${s.bundle.percent}% off</h6><div class="upsell-row">${ups.map((p) => `<div class="mini"><img src="${esc(img(p.images[0]))}" alt="" referrerpolicy="no-referrer"><b>${esc(p.title)}</b><span>${rs(p.price)}</span><button data-add="${p.id}">+ Add</button></div>`).join("")}</div></div>` : ""}`;
  $("#cart-foot", el).innerHTML = `
    <form class="coupon" id="coupon-f"><input name="code" placeholder="Discount code" value="${esc(state.coupon?.code || "")}" aria-label="Discount code"><button class="btn sm ghost">${state.coupon ? "Change" : "Apply"}</button></form>
    ${q.couponRejected ? `<small style="color:#D0313F">${esc(q.couponRejected)}</small>` : ""}
    <div class="sumline"><span>Subtotal</span><span>${rs(q.subtotal)}</span></div>
    ${q.discounts.map((d) => `<div class="sumline disc"><span>${esc(d.label)}</span><span>−${rs(d.amount)}</span></div>`).join("")}
    <div class="sumline"><span>Delivery</span><span>${q.shipping ? rs(q.shipping) : "FREE"}</span></div>
    <div class="sumline total"><span>Total</span><span>${rs(q.total)}</span></div>
    ${q.savings > 0 ? `<div class="savings-pill">${icon("badge-percent", "", 16)} You're saving ${rs(q.savings)} on this order</div>` : ""}
    <a class="btn rani block" href="/checkout" data-link data-close>${icon("lock", "", 16)} Checkout · ${rs(q.total)}</a>
    <div class="trust-mini"><span>${icon("banknote", "", 14)} Cash on delivery</span><span>${icon("refresh-ccw", "", 14)} ${s.returnDays}-day exchange</span><span>${icon("shield-check", "", 14)} Quality checked</span></div>`;
  el.onclick = (e) => {
    const b = e.target.closest("[data-q]");
    if (b) { const [id, size, qty] = b.dataset.q.split("|"); setQty(id, size, Math.min(10, Number(qty))); }
    const a = e.target.closest("[data-add]");
    if (a) { const p = state.byId[a.dataset.add]; addToCart(p.id, p.sizes[0]); toast(`${esc(p.title)} added`, { img: p.images[0] }); }
  };
  $("#coupon-f", el).onsubmit = async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim();
    if (!code) return setCoupon(null);
    try { setCoupon(await api("/api/coupon", { code })); toast("Code applied ✨"); }
    catch (err) { toast(esc(err.message), { icon: "x" }); }
  };
}

// ------------------------------------------------------------------ search
function openSearch() {
  const el = openOverlay(`<div class="wrap"><div class="search-input">${icon("search", "", 28)}<input id="sq" placeholder="Search lawn, khaddar, ajrak…" autocomplete="off"><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="search-sugg">${["Lawn", "Khaddar", "Unstitched", "Ready to wear", "Men", "Dupatta", "Shawl", "Eid", "3-Piece"].map((t) => `<button class="chip" data-s="${t}">${t}</button>`).join("")}</div>
    <div class="grid" id="sr" style="--cols:5"></div></div>`, { kind: "search-panel" });
  const input = $("#sq", el);
  const run = () => {
    const t = input.value.trim().toLowerCase();
    const hits = !t ? state.products.slice(0, 5) : state.products.filter((p) => [p.title, p.urdu, p.fabric, p.category, p.gender, p.region, p.motif, typeLabel(p), ...(p.colors || []), ...(p.occasions || [])].join(" ").toLowerCase().includes(t.replace(/s$/, ""))).slice(0, 10);
    $("#sr", el).innerHTML = hits.length ? hits.map((p) => card(p, { reveal: false })).join("") : `<p style="grid-column:1/-1;color:var(--muted)">Nothing yet for “${esc(t)}”. Try lawn, khaddar or dupatta.</p>`;
  };
  input.oninput = run;
  input.onkeydown = (e) => { if (e.key === "Enter" && input.value.trim()) { closeOverlay(); go(`/shop?q=${encodeURIComponent(input.value.trim())}`); } };
  el.onclick = (e) => { const s = e.target.closest("[data-s]"); if (s) { input.value = s.dataset.s; run(); } if (e.target.closest("a[data-link]")) closeOverlay(); };
  run();
  setTimeout(() => input.focus(), 300);
}
const typeLabel = (p) => (p.category === "accessory" ? p.accessoryType : p.category);

function openMenu() {
  const el = openOverlay(`<div class="drawer-head"><a class="logo" href="/" data-link data-close><span class="ur">آرزو</span></a><button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="drawer-body"><nav style="display:grid;gap:4px;font-family:var(--serif);font-size:1.9rem">
      ${[["Women", "/shop?gender=women"], ["Men", "/shop?gender=men"], ["Aarzu Originals", "/shop?collection=originals"], ["Dupattas & Shawls", "/shop?category=accessory"], ["New Arrivals", "/shop?sort=new"], ["Western · soon", "/western"], ["Wishlist", "/wishlist"], ["Track order", "/track"], ["Our story", "/about"], ["Contact", "/contact"]].map(([l, h], i) => `<a href="${h}" data-link data-close data-reveal="left" style="--i:${i};padding:6px 0;border-bottom:1px solid var(--line)">${l}</a>`).join("")}
    </nav></div>`, { kind: "drawer left" });
  setTimeout(() => reveal(el), 50);
}

// ------------------------------------------------------------------ wheel
export function openWheel() {
  const w = state.store.wheel, n = w.length, R = 150;
  const total = w.reduce((s, x) => s + x.weight, 0);
  const slices = w.map((s, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const p = (a) => `${150 + R * Math.cos(a)} ${150 + R * Math.sin(a)}`;
    const mid = (a0 + a1) / 2;
    return `<path d="M150 150 L${p(a0)} A${R} ${R} 0 0 1 ${p(a1)} Z" fill="${s.color}" stroke="#fff" stroke-width="2"/>
      <text x="${150 + 92 * Math.cos(mid)}" y="${150 + 92 * Math.sin(mid)}" fill="#fff" font-family="Jost,sans-serif" font-weight="600" font-size="${s.label.length > 8 ? 11 : 15}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${(mid * 180) / Math.PI + 90} ${150 + 92 * Math.cos(mid)} ${150 + 92 * Math.sin(mid)})">${esc(s.label)}</text>`;
  }).join("");
  const done = (() => { try { return JSON.parse(localStorage.getItem("az_spun")); } catch { return null; } })();
  const el = openOverlay(`<div class="wheel-wrap"><div class="wheel-stage"><div class="wheel-pin"></div><div class="wheel" id="wheel"><svg viewBox="0 0 300 300">${slices}</svg></div><div class="wheel-hub">آرزو</div></div>
    <div class="wheel-side"><span class="eyebrow">Spin & win</span><h3>Every spin <em>wins</em> something</h3>
      <div id="wheel-ctl">${done ? prizeHtml(done) : `<p style="margin:0;color:var(--ink-2)">Spin once for a discount on your order. Add your email or number and we'll save your code for you.</p>
      <form id="spin-f" style="display:grid;gap:10px;margin-top:14px"><div class="field"><input name="contact" placeholder="Email or mobile (optional)"></div><button class="btn rani block">${icon("sparkles", "", 16)} Spin the wheel</button></form>`}</div>
      <p class="odds">Real odds: ${w.filter((x, i, a) => a.findIndex((y) => y.label === x.label) === i).map((x) => `${x.label} ${Math.round((w.filter((y) => y.label === x.label).reduce((s, y) => s + y.weight, 0) / total) * 100)}%`).join(" · ")}. One spin per shopper.</p></div></div>`, { width: 820 });
  const f = $("#spin-f", el);
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    f.querySelector("button").disabled = true;
    try {
      const r = await api("/api/spin", { contact: f.contact.value });
      const target = 360 * 6 + (360 - (r.index + 0.5) * (360 / n));
      $("#wheel", el).style.transform = `rotate(${target}deg)`;
      setTimeout(() => {
        const prize = { label: r.prize.label, code: r.prize.code };
        localStorage.setItem("az_spun", JSON.stringify(prize));
        $("#wheel-ctl", el).innerHTML = prizeHtml(prize);
        confetti();
      }, 5400);
    } catch (err) { toast(esc(err.message)); }
  };
}
function prizeHtml(p) {
  return `<div class="prize"><span class="eyebrow" style="justify-content:center">You won</span><b class="serif" style="font-size:2rem">${esc(p.label)}</b><code>${esc(p.code)}</code><button class="btn rani" data-apply="${esc(p.code)}">Apply to my bag</button></div>`;
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-apply]");
  if (!a) return;
  try { setCoupon(await api("/api/coupon", { code: a.dataset.apply })); toast("Code applied to your bag ✨"); closeOverlay(); }
  catch (err) { toast(esc(err.message)); }
});

// ------------------------------------------------------------------ real recent orders
async function socialProof() {
  let list = [];
  try { list = await api("/api/activity"); } catch {}
  if (!list.length) return;
  const el = document.createElement("a");
  el.className = "social-proof";
  document.body.append(el);
  let i = 0;
  const show = () => {
    const o = list[i++ % list.length];
    const mins = Math.round((Date.now() - Date.parse(o.at)) / 6e4);
    const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
    el.href = `/product/${o.slug}`;
    el.setAttribute("data-link", "");
    el.innerHTML = `<img src="${esc(img(o.image))}" alt="" referrerpolicy="no-referrer"><span><small>Someone in ${esc(o.city)} ordered</small><b>${esc(o.title)}</b><small>${ago}</small></span>`;
    el.classList.add("on");
    setTimeout(() => el.classList.remove("on"), 6000);
  };
  setTimeout(show, 9000);
  setInterval(show, 28000);
}

// ------------------------------------------------------------------ router
let cleanup = null;
export function go(href, replace) {
  if (replace) history.replaceState({}, "", href); else history.pushState({}, "", href);
  render({ replace });
}

// Each page renders into a fresh view element so listeners never pile up on #main.
async function render({ replace = false } = {}) {
  const url = new URL(location.href);
  cleanup?.();
  cleanup = null;
  closeOverlay();
  const view = document.createElement("div");
  if (!replace) view.className = "page-enter";
  $("#main").replaceChildren(view);
  let match = null, params = [];
  for (const [re, fn] of routes) { const m = url.pathname.match(re); if (m) { match = fn; params = m.slice(1); break; } }
  const res = await (match || routes.at(-1)[1])(view, { url, params, go, replace });
  cleanup = typeof res === "function" ? res : null;
  $$("[data-nav]").forEach((a) => {
    const k = a.dataset.nav, q = url.searchParams;
    a.classList.toggle("active", q.get("gender") === k || q.get("collection") === k || q.get("category") === k || url.pathname === "/" + k);
  });
  if (!replace) scrollTo({ top: 0, behavior: "instant" });
  reveal(view);
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-cart]")) { e.preventDefault(); return openCart(); }
  if (e.target.closest("[data-spin]")) { e.preventDefault(); return openWheel(); }
  const a = e.target.closest("a[data-link]");
  if (a && !e.metaKey && !e.ctrlKey && a.origin === location.origin) {
    e.preventDefault();
    if (a.hasAttribute("data-close")) closeOverlay();
    go(a.getAttribute("href"));
  }
});
addEventListener("popstate", () => render());

// First visit: offer the wheel once (not during checkout), plus on exit intent.
function wheelPrompt() {
  const seen = () => localStorage.getItem("az_spun") || sessionStorage.getItem("az_wheel_seen");
  const show = () => { if (seen() || /checkout|order|admin/.test(location.pathname) || $(".modal, .drawer")) return; sessionStorage.setItem("az_wheel_seen", "1"); openWheel(); };
  setTimeout(show, 15000);
  document.addEventListener("mouseout", (e) => { if (!e.relatedTarget && e.clientY < 8) show(); });
}

(async function start() {
  try { await boot(); } catch (e) { $("#main").innerHTML = `<div class="empty-state"><h3>Couldn't reach the store</h3><p>${esc(e.message)}</p></div>`; return; }
  announce(); header(); footer(); fab();
  on(() => counts());
  cardActions(document.body);
  await render();
  socialProof();
  wheelPrompt();
  void sid;
})();
