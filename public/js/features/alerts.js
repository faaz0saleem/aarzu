// Alerts · back-in-stock requests, abandoned-bag recovery and the Eid page. Server side: lib/routes/alerts.mjs.
//   pdp-actions        "Notify me when it's back" for sold-out sizes (phone required, email optional)
//   checkout-extras    saves the bag once a valid name + mobile are filled in (debounced), with one honest line
//   /eid · home-mid    countdown to state.store.festive (default Eid ul-Fitr), a safe order-by date from the real
//                      delivery days, festive/formal pieces from the catalogue, gift cards. The home band shows
//                      only in the 45 days before the date.
//   admin tabs         "Restock requests" (grouped by product + size) and "Abandoned bags", with WhatsApp links
import { $, $$, esc, rs, img, icon, api, state, on, quote, card, listed, toast, reveal, countdown, stockLeft, sid, registerRoute, registerSlot, registerLink, registerAdminTab } from "../core.js";

// Slots are shared with other features: add our own box, never replace the slot's content.
const mount = (el, html, first = false) => { el.insertAdjacentHTML(first ? "afterbegin" : "beforeend", html); return first ? el.firstElementChild : el.lastElementChild; };
const phoneOf = (v) => { const d = String(v || "").replace(/\D/g, ""); return /^03\d{9}$/.test(d) ? "92" + d.slice(1) : /^923\d{9}$/.test(d) ? d : null; };
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
const showPhone = (p) => (/^92\d{10}$/.test(p) ? `0${p.slice(2, 5)} ${p.slice(5)}` : p);
const intlPhone = (p) => (/^92\d{10}$/.test(p) ? `+92 ${p.slice(2, 5)} ${p.slice(5)}` : `+${p}`);
const names = (list) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);
const savedCustomer = () => { try { return JSON.parse(localStorage.getItem("az_cust")) || {}; } catch { return {}; } };
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const ago = (iso) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 6e4));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

// ================================================================== PDP: back in stock
function pdpNotify(el, data) {
  const p = state.byId[data.pid];
  if (!p || p.category === "giftcard") return;
  const out = p.sizes.filter((z) => (p.stock?.[z] ?? 0) <= 0);
  if (!out.length) return;
  const one = p.sizes.length === 1;
  const all = out.length === p.sizes.length;
  const me = savedCustomer();
  const box = mount(el, `<div class="al-notify ${all ? "all" : ""}">
    <div class="al-n-head"><span class="al-n-ic">${icon("bell", "", 18)}</span>
      <div><b>${all ? "Sold out for now" : `Size ${esc(names(out))} ${out.length === 1 ? "is" : "are"} sold out`}</b>
      <small>${all ? "Leave your number and we'll tell you when it's back." : "Want one of these? We'll tell you when it's back."}</small></div></div>
    ${all ? "" : `<button type="button" class="btn ghost sm al-n-open" aria-expanded="false">${icon("bell", "", 15)} Notify me when it's back</button>`}
    <form class="al-n-form" novalidate ${all ? "" : "hidden"}>
      ${one ? "" : `<div class="al-n-sizes" role="radiogroup" aria-label="Size you want">${out.map((z) => `<label class="al-n-sz"><input type="radio" name="size" value="${esc(z)}" ${out.length === 1 ? "checked" : ""}><span>${esc(z)}</span></label>`).join("")}</div>`}
      <div class="row2">
        <div class="field" data-k="phone"><label>Mobile number</label><input name="phone" inputmode="tel" autocomplete="tel" placeholder="03XX XXXXXXX" value="${esc(me.phone || "")}"><span class="msg"></span></div>
        <div class="field" data-k="email"><label>Email (optional)</label><input name="email" type="email" autocomplete="email" placeholder="you@example.com" value="${esc(me.email || "")}"><span class="msg"></span></div>
      </div>
      <button class="btn rani block al-n-go">${icon("bell", "", 16)} Notify me when it's back</button>
      <small class="al-n-note">Just one message when it's back. With an email, it comes straight to your inbox.</small>
    </form></div>`, true);
  const form = $(".al-n-form", box);
  const opener = $(".al-n-open", box);
  if (opener) opener.onclick = () => {
    const open = form.hidden;
    form.hidden = !open;
    opener.setAttribute("aria-expanded", String(open));
    if (open) (form.querySelector("input[name=size]:not(:checked)") || form.elements.namedItem("phone")).focus();
  };
  const fieldErr = (k, msg) => { const f = $(`[data-k="${k}"]`, form); if (!f) return; f.classList.add("err"); $(".msg", f).textContent = msg; };
  form.onsubmit = async (e) => {
    e.preventDefault();
    $$(".field", form).forEach((f) => { f.classList.remove("err"); $(".msg", f).textContent = ""; });
    const size = one ? p.sizes[0] : form.querySelector("input[name=size]:checked")?.value;
    const phone = form.elements.namedItem("phone").value.trim();
    const email = form.elements.namedItem("email").value.trim();
    if (!size) { const s = $(".al-n-sizes", form); s.classList.remove("shake"); void s.offsetWidth; s.classList.add("shake"); return toast("Choose the size you want", { icon: "ruler" }); }
    let bad = false;
    if (!phoneOf(phone)) { fieldErr("phone", "Enter a valid mobile number, e.g. 0300 1234567."); bad = true; }
    if (email && !emailOk(email)) { fieldErr("email", "That email doesn't look right."); bad = true; }
    if (bad) return $(".field.err input", form)?.focus();
    const btn = $(".al-n-go", form);
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Saving…`;
    try {
      const r = await api("/api/alerts/restock", { id: p.id, size, phone, email });
      const what = `${esc(p.title)}${one ? "" : ` in ${esc(size)}`}`;
      box.classList.add("done");
      box.innerHTML = `<div class="al-n-head"><span class="al-n-ic ok">${icon("check", "", 18)}</span><div>
        <b>${r.already ? "You're already on the list" : "Done, you're on the list"}</b>
        <small>We'll tell you on ${esc(showPhone(phoneOf(phone)))}${email ? ` and by email` : ""} when ${what} is back.</small></div></div>`;
    } catch (err) {
      for (const [k, m] of Object.entries(err.data?.errors || {})) fieldErr(k, m);
      toast(esc(err.message), { icon: err.status === 409 ? "circle-check" : "x", ms: 5000 });
      btn.disabled = false; btn.innerHTML = `${icon("bell", "", 16)} Notify me when it's back`;
    }
  };
}

// ================================================================== checkout: save the bag
function checkoutDraft(el) {
  if (!quote().items.length) return;
  const form = el.closest("form");
  if (!form) return;
  mount(el, `<p class="al-co">${icon("shield-check", "", 15)}<span>We save your bag so we can help if you get stuck.</span></p>`);
  const val = (k) => String(form.elements.namedItem(k)?.value || "").trim();
  let timer = 0, last = "", pausedUntil = 0;
  const save = async () => {
    if (!el.isConnected || Date.now() < pausedUntil) return;
    const q = quote();
    const d = { sid, name: val("name"), phone: val("phone"), city: val("city"), items: q.items.map((i) => ({ id: i.id, title: i.title, size: i.size, qty: i.qty })), total: q.total };
    if (d.name.length < 2 || !phoneOf(d.phone) || !d.items.length) return;
    const key = JSON.stringify(d);
    if (key === last) return;
    last = key;
    try { await api("/api/alerts/checkout-draft", d); } catch { last = ""; }
  };
  const later = () => { clearTimeout(timer); timer = setTimeout(save, 900); };
  form.addEventListener("change", later);
  form.addEventListener("focusout", later);
  // placing the order: don't let a late save race it (the server ignores those too)
  form.addEventListener("submit", () => { clearTimeout(timer); pausedUntil = Date.now() + 15000; }, true);
  const off = on((what) => { if (!el.isConnected) return off(); if (what === "cart" && last) later(); });
}

// ================================================================== Eid: dates
const DEFAULT_FESTIVE = { name: "Eid ul-Fitr", urdu: "عید مبارک", date: "2027-03-10", note: "Date depends on moon sighting" };
const DAY = 864e5;
const RUSH = 2; // spare working days for the courier rush before Eid
const FESTIVE = /^(eid|festive|festival|formal|wedding guest|party)$/i;

function festive() {
  const f = { ...DEFAULT_FESTIVE, ...(state.store?.festive || {}) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date)) || Number.isNaN(Date.parse(f.date))) f.date = DEFAULT_FESTIVE.date;
  return f;
}
const utcDay = (y, m, d) => new Date(Date.UTC(y, m, d));
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return utcDay(y, m - 1, d); };
const shift = (d, n) => new Date(d.getTime() + n * DAY);
const backWork = (d, n) => { let x = d; while (n > 0) { x = shift(x, -1); if (x.getUTCDay() !== 0) n--; } return x; }; // Mon–Sat
const pkToday = () => { const pk = new Date(Date.now() + 5 * 3600e3); return utcDay(pk.getUTCFullYear(), pk.getUTCMonth(), pk.getUTCDate()); };
const fmtDay = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const fmtLong = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const maxDays = (s, d = 6) => { const n = String(s ?? "").match(/\d+/g); return n ? Math.max(...n.map(Number)) : d; };

// Latest safe order day: arrive the day before the earliest possible Eid (moon sighting can bring it a day
// forward), counting back the city's slowest delivery time, next-day dispatch and RUSH spare days (Mon–Sat).
function plan() {
  const f = festive();
  const s = state.store;
  const eid = parseDay(f.date);
  let target = shift(eid, -2);
  if (target.getUTCDay() === 0) target = shift(target, -1);
  const by = (days) => backWork(target, days + 1 + RUSH);
  const cities = (s.cities || []).map((c) => ({ name: c.name, days: c.days, by: by(maxDays(c.days)) }));
  const slow = Math.max(0, ...(s.cities || []).map((c) => maxDays(c.days))) || 6;
  const st = s.addons?.stitching;
  const stitchDays = st ? maxDays(st.turnaround || "7–10 working days", 10) : 0;
  const anywhere = by(slow);
  const start = Date.parse(`${f.date}T00:00:00+05:00`);
  const today = pkToday();
  return { f, eid, start, cities, slow, anywhere, stitch: st ? backWork(anywhere, stitchDays) : null, stitchDays, today, passed: (d) => today > d, left: start - Date.now() };
}

function picks() {
  const rank = (p) => (p.occasions || []).some((o) => /^eid$/i.test(o)) ? 1 : 0;
  return listed()
    .filter((p) => p.category !== "giftcard" && p.images?.length && (p.occasions || []).some((o) => FESTIVE.test(o)))
    .sort((a, b) => (stockLeft(b) > 0) - (stockLeft(a) > 0) || rank(b) - rank(a) || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
}
const giftCards = () => state.products.filter((p) => p.category === "giftcard").sort((a, b) => a.price - b.price);
const inDays = (ms) => { const d = Math.ceil(ms / DAY); return d <= 1 ? "tomorrow" : `in ${d} days`; };

// ================================================================== /eid
function eidPage(view) {
  const P = plan();
  const { f } = P;
  const list = picks();
  const before = P.left > 0;
  const wa = state.store.contact?.whatsapp;
  const gcs = giftCards();
  const saved = (() => { try { return localStorage.getItem("az_city"); } catch { return null; } })();
  const city = P.cities.find((c) => c.name === saved) || P.cities[0];
  const occs = [...new Set(list.flatMap((p) => (p.occasions || []).filter((o) => FESTIVE.test(o))))];
  const genders = [...new Set(list.map((p) => p.gender))].filter((g) => g === "women" || g === "men");

  view.innerHTML = `
  <section class="al-eid-hero">
    <div class="wrap al-eid-in">
      <div class="al-eid-copy">
        <span class="eyebrow fade-up" style="--delay:.05s">The Eid edit</span>
        <h1 class="fade-up" style="--delay:.15s">${esc(f.name)} <em>edit</em></h1>
        <div class="urdu al-eid-ur fade-up" style="--delay:.25s">${esc(f.urdu)}</div>
        <p class="al-eid-date fade-up" style="--delay:.35s">${icon("clock", "", 17)}<span>${before ? "Expected on" : "Was expected on"} <b>${esc(fmtLong(P.eid))}</b>${f.note ? ` · ${esc(f.note)}` : ""}</span></p>
        ${before ? `<div class="cdown al-cd fade-up" style="--delay:.45s" id="al-eid-cd" aria-label="Time until ${esc(f.name)}"></div>` : `<p class="al-eid-mubarak fade-up" style="--delay:.45s">Eid Mubarak from all of us at Aarzu.</p>`}
        <div class="al-eid-ctas fade-up" style="--delay:.55s">${list.length ? `<button type="button" class="btn gold" data-al-go="al-eid-shop">${icon("sparkles", "", 16)} Shop the edit</button>` : ""}${gcs.length ? `<a class="btn ghost-light" href="/gift-cards" data-link>${icon("gift", "", 16)} Eidi gift cards</a>` : ""}</div>
      </div>
      ${list.length ? `<div class="al-eid-arches fade-up" style="--delay:.3s;--n:${Math.min(3, list.length)}">${list.slice(0, 3).map((p, i) => `<a class="al-arch" href="/product/${esc(p.slug)}" data-link style="--k:${i}" aria-label="${esc(p.title)}"><img src="${esc(img(p.images[0]))}" alt="" referrerpolicy="no-referrer" ${i ? 'loading="lazy"' : ""}></a>`).join("")}</div>` : ""}
    </div>
  </section>

  ${before ? `<section class="wrap al-eid-by-sec"><div class="al-eid-by" data-reveal>
    <div class="al-eid-by-main">
      <span class="eyebrow">${icon("truck", "", 15)} Delivery before Eid</span>
      ${P.passed(P.anywhere)
        ? `<h2>Short on <em>time?</em></h2><p>Our safe order date for every city (${esc(fmtDay(P.anywhere))}) has passed. Check your city below, or WhatsApp us before you order and we'll tell you honestly if it can arrive in time.</p>`
        : `<h2>Order by <em>${esc(fmtDay(P.anywhere))}</em></h2><p>for delivery before Eid, anywhere in Pakistan.</p>`}
      <small>How we work it out: our slowest delivery time (${P.slow} working days), next-day dispatch, ${RUSH} spare days for the Eid rush, and Eid coming a day early.</small>
    </div>
    <div class="al-eid-city">
      <label for="al-city">Your city</label>
      <select id="al-city">${P.cities.map((c) => `<option ${c === city ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <div id="al-city-out" aria-live="polite"></div>
      ${P.stitch ? `<p class="al-eid-stitch">${icon("scissors", "", 15)}<span>${P.passed(P.stitch) ? "Stitching adds up to " + P.stitchDays + " working days, so there's no longer time for stitched orders before Eid." : `Adding stitching? Order by <b>${esc(fmtDay(P.stitch))}</b>. It adds up to ${P.stitchDays} working days.`}</span></p>` : ""}
    </div>
  </div></section>` : ""}

  <section class="sec wrap al-anchor" id="al-eid-shop">
    <div class="sec-head" data-reveal><span class="eyebrow">Dressed for Eid</span><h2>Festive &amp; formal <em>picks</em></h2><div class="urdu">عید کے لیے</div>
      ${list.length ? `<p>${list.length} ${list.length === 1 ? "piece" : "pieces"} for Eid, weddings and dressy days, in-stock first.</p>` : ""}</div>
    ${list.length && genders.length > 1 ? `<div class="al-eid-tabs"><div class="tabs" id="al-eid-tabs">${[["all", "All"], ...genders.map((g) => [g, g === "men" ? "Men" : "Women"])].map(([k, l], i) => `<button type="button" class="${i ? "" : "on"}" data-al-g="${k}">${l}</button>`).join("")}</div></div>` : ""}
    <div class="grid" style="--cols:4" id="al-eid-grid"></div>
    ${list.length ? `<div class="al-eid-more"><a class="btn ghost" href="/shop?occasion=${encodeURIComponent(occs.join(","))}" data-link>See all in the shop ${icon("arrow-right", "", 16)}</a></div>` : ""}
  </section>

  ${gcs.length ? `<section class="wrap al-eid-gift-sec"><a class="al-eid-gift" href="/gift-cards" data-link data-reveal="zoom">
    <div><span class="eyebrow">Eidi, sorted</span><h2>Give an Aarzu <em>gift card</em></h2>
      <p>From ${rs(gcs[0].price)} to ${rs(gcs.at(-1).price)}, sent on WhatsApp or email with your own message. No delivery wait.</p>
      <span class="btn gold">${icon("gift", "", 16)} Choose a gift card</span></div>
    <div class="al-eid-gift-pics" aria-hidden="true">${gcs.slice(0, 2).map((p, k) => `<img src="${esc(img(p.images[0]))}" alt="" style="--k:${k}" loading="lazy">`).join("")}</div>
  </a></section>` : ""}`;

  if (before) countdown($("#al-eid-cd", view), new Date(P.start).toISOString());

  const cityOut = () => {
    const c = P.cities.find((x) => x.name === $("#al-city", view).value) || city;
    if (!c) return;
    $("#al-city-out", view).innerHTML = P.passed(c.by)
      ? `<b class="al-eid-late">The safe date for ${esc(c.name)} (${esc(fmtDay(c.by))}) has passed.</b><small>${wa ? `<a href="https://wa.me/${esc(wa)}?text=${encodeURIComponent(`Assalam o Alaikum Aarzu! Can an order to ${c.name} still arrive before Eid?`)}" target="_blank" rel="noopener">WhatsApp us</a> and we'll tell you honestly if it can still make it.` : "Message us and we'll tell you honestly if it can still make it."}</small>`
      : `<b>Order by ${esc(fmtDay(c.by))}</b><small>Delivery to ${esc(c.name)} takes ${esc(c.days)} working days.</small>`;
  };
  if ($("#al-city", view)) {
    cityOut();
    $("#al-city", view).onchange = (e) => { try { localStorage.setItem("az_city", e.target.value); } catch {} cityOut(); };
  }

  const grid = $("#al-eid-grid", view);
  const fill = (g) => {
    const shown = list.filter((p) => g === "all" || p.gender === g).slice(0, 12);
    grid.innerHTML = shown.length ? shown.map((p, i) => card(p, { i })).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="ur">عید</div><h3>The Eid edit is on its way</h3><p>New festive pieces are being added. Check back soon, or browse the whole shop.</p><a class="btn rani" href="/shop" data-link>Shop now</a></div>`;
    reveal(grid);
  };
  fill("all");
  const tabs = $("#al-eid-tabs", view);
  if (tabs) tabs.onclick = (e) => { const b = e.target.closest("[data-al-g]"); if (!b) return; $$("button", tabs).forEach((x) => x.classList.toggle("on", x === b)); fill(b.dataset.alG); };
  view.addEventListener("click", (e) => { const b = e.target.closest("[data-al-go]"); if (b) document.getElementById(b.dataset.alGo)?.scrollIntoView({ behavior: "smooth" }); });
}

// ================================================================== home: Eid band (45 days before only)
function eidBand(el) {
  const P = plan();
  if (!(P.left > 0 && P.left <= 45 * DAY)) return;
  const { f } = P;
  const list = picks();
  const late = P.passed(P.anywhere);
  const box = mount(el, `<section class="wrap al-band-sec"><div class="al-band" data-reveal="zoom">
    <span class="al-band-ur" aria-hidden="true">${esc(f.urdu)}</span>
    <div class="al-band-copy">
      <span class="eyebrow">${esc(f.name)} · ${inDays(P.left)}</span>
      <h2>Dress up for <em>Eid</em></h2>
      <p>${late ? "Our safe order date for every city has passed. WhatsApp us to check yours before you order." : `Order by <b>${esc(fmtDay(P.anywhere))}</b> for delivery before Eid, anywhere in Pakistan.`}${f.note ? ` <small>${esc(f.note)}.</small>` : ""}</p>
      <div class="cdown al-band-cd"></div>
      <div class="al-band-ctas"><a class="btn gold" href="/eid" data-link>${icon("sparkles", "", 16)} Shop the Eid edit</a>${giftCards().length ? `<a class="btn ghost-light" href="/gift-cards" data-link>Eidi gift cards</a>` : ""}</div>
    </div>
    ${list.length ? `<a class="al-band-pics" href="/eid" data-link aria-label="See the Eid edit" style="--n:${Math.min(3, list.length)}">${list.slice(0, 3).map((p, i) => `<span class="al-arch" style="--k:${i}"><img src="${esc(img(p.images[0]))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`).join("")}</a>` : ""}
  </div></section>`);
  countdown($(".al-band-cd", box), new Date(P.start).toISOString());
}

// ================================================================== admin: restock requests
const pill = (x, inStock) => x.contactedAt ? `<span class="al-pill done">Contacted</span>`
  : x.status === "notified" ? `<span class="al-pill back">Back in stock${x.emailedAt ? " · emailed" : ""}</span>`
  : inStock > 0 ? `<span class="al-pill back">In stock now</span>` : `<span class="al-pill wait">Waiting</span>`;
const toggle = (attr, id, on) => `<button type="button" class="al-toggle ${on ? "on" : ""}" ${attr}="${esc(id)}" aria-pressed="${on}">${icon(on ? "circle-check" : "check", "", 15)} ${on ? "Contacted" : "Mark contacted"}</button>`;

async function restockTab(el, call) {
  el.innerHTML = `<div class="al-admin"><p class="al-muted">Loading restock requests…</p></div>`;
  let { site, groups } = await call("/api/admin/alerts/restock");
  site = (site || location.origin).replace(/\/$/, "");
  const waText = (g) => `Good news! ${g.title}${g.oneSize ? "" : ` in ${g.size}`} is back at Aarzu. You asked us to let you know. ${site}/product/${g.slug}`;
  const draw = () => {
    const people = groups.flatMap((g) => g.people);
    el.innerHTML = `<div class="al-admin">
      <div class="al-admin-head"><h3>Restock requests <span class="ur">واپسی</span></h3><p>Shoppers waiting for a sold-out size. When it's back, anyone who left an email gets one automatically; WhatsApp the rest.</p></div>
      <div class="al-kpis">${[[people.filter((x) => x.status === "pending").length, "Waiting"], [groups.reduce((s, g) => s + g.toContact, 0), "Back · to contact"], [people.filter((x) => x.contactedAt).length, "Contacted"], [groups.length, "Sizes asked for"]].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      ${groups.length ? `<div class="al-groups">${groups.map((g) => `<article class="al-group">
        <header>
          ${g.image ? `<img src="${esc(img(g.image))}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="al-noimg">${icon("shirt", "", 20)}</span>`}
          <div class="al-g-t"><b>${g.slug ? `<a href="/product/${esc(g.slug)}" data-link>${esc(g.title)}</a>` : esc(g.title)}</b>
            <small>${g.oneSize ? "" : `Size <b>${esc(g.size)}</b> · `}${g.inStock == null ? "No longer in the catalogue" : g.inStock > 0 ? `<span class="al-in">${g.inStock} in stock</span>` : "Sold out"}</small></div>
          <div class="al-g-n"><span><b>${g.waiting}</b> waiting</span>${g.toContact ? `<span class="hot"><b>${g.toContact}</b> to contact</span>` : ""}${g.contacted ? `<span><b>${g.contacted}</b> contacted</span>` : ""}</div>
        </header>
        <ul class="al-people">${g.people.map((x) => `<li>
          <div class="al-who"><a href="tel:+${esc(x.phone)}"><b>${esc(intlPhone(x.phone))}</b></a><small>${x.email ? `${esc(x.email)} · ` : ""}asked ${esc(shortDate(x.at))}${x.notifiedAt ? ` · back ${esc(shortDate(x.notifiedAt))}` : ""}</small></div>
          ${pill(x, g.inStock)}
          <div class="al-acts">${g.inStock > 0 ? `<a class="btn wa sm" href="https://wa.me/${esc(x.phone)}?text=${encodeURIComponent(waText(g))}" target="_blank" rel="noopener">${icon("whatsapp", "", 14)} WhatsApp</a>` : `<small class="al-muted">Still sold out</small>`}${toggle("data-al-rc", x.id, !!x.contactedAt)}</div>
        </li>`).join("")}</ul></article>`).join("")}</div>`
      : `<div class="empty-state"><div class="ur">واپسی</div><h3>No requests yet</h3><p>When a size sells out, shoppers can ask to hear when it's back. Their requests appear here.</p></div>`}</div>`;
  };
  draw();
  el.onclick = async (e) => {
    const b = e.target.closest("[data-al-rc]");
    if (!b) return;
    b.disabled = true;
    try {
      const r = await call(`/api/admin/alerts/restock/${encodeURIComponent(b.dataset.alRc)}`, { contacted: b.getAttribute("aria-pressed") !== "true" });
      groups = groups.map((g) => {
        const people = g.people.map((x) => (x.id === r.id ? { ...x, contactedAt: r.contactedAt } : x));
        return { ...g, people, contacted: people.filter((x) => x.contactedAt).length, toContact: people.filter((x) => !x.contactedAt && (x.status === "notified" || g.inStock > 0)).length };
      });
      draw();
    } catch (err) { b.disabled = false; toast(esc(err.message), { icon: "x" }); }
  };
}

// ================================================================== admin: abandoned bags
async function abandonedTab(el, call) {
  el.innerHTML = `<div class="al-admin"><p class="al-muted">Loading bags…</p></div>`;
  let d = await call("/api/admin/alerts/drafts");
  const site = (d.site || location.origin).replace(/\/$/, "");
  let filter = "todo";
  const first = (n) => String(n || "").split(" ")[0];
  const what = (b) => `${b.items[0]?.title || "something"}${b.items.length > 1 ? ` and ${b.items.length - 1} more` : ""}`;
  const waText = (b) => `Assalam o Alaikum ${first(b.name)}, you left ${what(b)} in your Aarzu bag — need any help with size or delivery? ${site}/checkout`;
  const F = [["todo", "To contact", (b) => !b.contactedAt], ["done", "Contacted", (b) => !!b.contactedAt], ["all", "All", () => true]];
  const draw = () => {
    const list = d.abandoned;
    const shown = list.filter(F.find((x) => x[0] === filter)[2]);
    el.innerHTML = `<div class="al-admin">
      <div class="al-admin-head"><h3>Abandoned bags <span class="ur">ادھوری خریداری</span></h3><p>Shoppers who entered their name and number at checkout but haven't ordered for 30 minutes or more. Bags are kept for ${d.days} days.</p></div>
      <div class="al-kpis">${[[list.length, "Abandoned"], [rs(list.reduce((s, b) => s + (b.total || 0), 0)), "Left in bags"], [d.recovered, "Recovered"], [d.inProgress, "Checking out now"]].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      ${d.recovered ? `<p class="al-muted">${icon("circle-check", "", 15)} ${d.recovered} saved ${d.recovered === 1 ? "bag" : "bags"} went on to order (${rs(d.recoveredValue)}).</p>` : ""}
      <div class="al-filter">${F.map(([k, l, fn]) => `<button type="button" class="chip ${k === filter ? "on" : ""}" data-al-f="${k}">${l} <small>${list.filter(fn).length}</small></button>`).join("")}</div>
      ${shown.length ? `<div class="al-bags">${shown.map((b) => `<article class="al-bag">
        <div class="al-who"><b>${esc(b.name)}</b><a href="tel:+${esc(b.phone)}">${esc(intlPhone(b.phone))}</a><small>${b.city ? `${esc(b.city)} · ` : ""}last active ${esc(ago(b.updatedAt))}</small></div>
        <ul class="al-items">${b.items.map((i) => `<li>${i.slug ? `<a href="/product/${esc(i.slug)}" data-link>${esc(i.title)}</a>` : esc(i.title)} <small>${esc(i.size)} × ${i.qty}</small></li>`).join("")}</ul>
        <div class="al-acts"><b class="al-total">${rs(b.total || 0)}</b><a class="btn wa sm" href="https://wa.me/${esc(b.phone)}?text=${encodeURIComponent(waText(b))}" target="_blank" rel="noopener">${icon("whatsapp", "", 14)} Follow up</a>${toggle("data-al-dc", b.sid, !!b.contactedAt)}</div>
      </article>`).join("")}</div>`
      : `<div class="empty-state"><div class="ur">خالی</div><h3>${list.length ? "Nothing in this list" : "No abandoned bags"}</h3><p>${list.length ? "Try another filter." : "When someone fills in their details at checkout but doesn't order, their bag shows up here after 30 minutes."}</p></div>`}</div>`;
  };
  draw();
  el.onclick = async (e) => {
    const f = e.target.closest("[data-al-f]");
    if (f) { filter = f.dataset.alF; return draw(); }
    const b = e.target.closest("[data-al-dc]");
    if (!b) return;
    b.disabled = true;
    try {
      const r = await call(`/api/admin/alerts/drafts/${encodeURIComponent(b.dataset.alDc)}`, { contacted: b.getAttribute("aria-pressed") !== "true" });
      d = { ...d, abandoned: d.abandoned.map((x) => (x.sid === r.sid ? { ...x, contactedAt: r.contactedAt } : x)) };
      draw();
    } catch (err) { b.disabled = false; toast(esc(err.message), { icon: "x" }); }
  };
}

// ================================================================== register
export async function init() {
  registerSlot("pdp-actions", pdpNotify);
  registerSlot("checkout-extras", checkoutDraft);
  registerSlot("home-mid", eidBand);
  registerRoute(/^\/eid\/?$/, eidPage);
  registerLink({ where: "shop", label: "Eid edit", href: "/eid" });
  registerAdminTab({ key: "restock", label: "Restock requests", render: restockTab });
  registerAdminTab({ key: "abandoned", label: "Abandoned bags", render: abandonedTab });
}
