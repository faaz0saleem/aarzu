// Page renderers. Each takes (main, ctx) and may return a cleanup function.
import { $, $$, esc, rs, img, icon, api, state, card, skeletons, stars, toast, openOverlay, reveal, splitWords, petals, countdown, dispatchInfo, addToCart, flyToCart, pushRecent, quote, clearCart, confetti, stockLeft, typeLabel, colorCss, sid, toggleWish, ext, listed, lineExtras, fillSlots, setCredit } from "./core.js";

const P = () => listed();
const withImg = (f = () => true) => P().filter((p) => p.images?.length && f(p));
const suits = (p) => p.category !== "accessory";
const pickImgs = (list, n) => list.slice(0, n).map((p) => p.images[0]);
const media = (slot) => state.media.filter((m) => m.slot === slot).map((m) => m.image);

const REGIONS = [
  { key: "Sindh", ur: "سندھ", c: "#B3122E", crafts: [["Ajrak", "Indigo & madder block print"], ["Sheesha", "Mirror work from Thar"], ["Rilli", "Patchwork quilts"]], text: "Along the Indus, colour is printed by hand: ajrak's stars, rilli patchwork and mirrors that catch the desert sun." },
  { key: "Punjab", ur: "پنجاب", c: "#F2A900", crafts: [["Phulkari", "Satin-stitch flower work"], ["Kashi", "Multan's blue tiles"], ["Chunri", "Tie-dye dots"]], text: "Punjab dresses for celebration: phulkari for weddings, chunri for Basant, Multani blues for the summers." },
  { key: "Khyber Pakhtunkhwa", ur: "خیبر پختونخوا", c: "#0B5D4B", crafts: [["Swati", "Geometric cross-stitch"], ["Khaddar", "Hand-loomed warmth"], ["Peshawari", "Waistcoats & chappals"]], text: "Mountain crafts built for winter: Swati geometry, hand-loomed khaddar and the waistcoats of Qissa Khwani." },
  { key: "Balochistan", ur: "بلوچستان", c: "#D6246E", crafts: [["Doch", "Dense Balochi embroidery"], ["Pashk", "The embroidered front panel"], ["Mosam", "Mirror & thread work"]], text: "A Balochi dress takes months: a dense embroidered yoke, cuffs and the long pashk panel down the front." },
  { key: "Chitral & Gilgit", ur: "چترال", c: "#0FA3A3", crafts: [["Kalash", "Colour-banded robes"], ["Patti", "Chitrali wool"], ["Pakol", "The rolled wool cap"]], text: "In the north, black robes blaze with bands of colour and beads, and patti wool keeps out the mountain cold." },
];
const OCCASIONS = [["Eid", "عید", "#D6246E"], ["Mehndi", "مہندی", "#E9A825"], ["Wedding Guest", "شادی", "#7A1530"], ["Jummah", "جمعہ", "#0B5D4B"], ["Office", "دفتر", "#1C2A6B"], ["Everyday", "روزمرہ", "#0F7C80"]];
const tex = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const CRAFTS = [
  ["Ajrak", "اجرک", "#B3122E", "Printed with up to 21 stages of resist and dye. Ajrak is Sindh's gift, given to honour guests.", `<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><rect width='46' height='46' fill='#9B1B1F'/><rect x='13' y='13' width='20' height='20' fill='#1D2A5B' transform='rotate(45 23 23)'/><circle cx='23' cy='23' r='5' fill='#9B1B1F'/><circle cx='0' cy='0' r='6' fill='#1D2A5B'/><circle cx='46' cy='46' r='6' fill='#1D2A5B'/></svg>`],
  ["Phulkari", "پھلکاری", "#F2A900", "'Flower work' in floss silk, stitched from the back of the cloth so patterns appear like woven light.", `<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><rect width='46' height='46' fill='#7A1530'/><path d='M23 3L43 23L23 43L3 23Z' fill='#F2A900'/><path d='M23 12L34 23L23 34L12 23Z' fill='#E8336D'/></svg>`],
  ["Truck Art", "ٹرک آرٹ", "#0FA3A3", "Pakistan's moving galleries: peacocks, florals and chamak-patti in colours that refuse to whisper.", `<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><rect width='46' height='46' fill='#0F7C80'/><circle cx='23' cy='23' r='12' fill='#E8336D'/><circle cx='23' cy='23' r='6' fill='#FFD23F'/><path d='M0 0h12L6 10z' fill='#F26B1D'/></svg>`],
  ["Kashi Kari", "کاشی کاری", "#1C2A6B", "Multan's cobalt-and-turquoise glazed tiles, which still cover its shrines after seven centuries.", `<svg xmlns='http://www.w3.org/2000/svg' width='46' height='46'><rect width='46' height='46' fill='#FBF7EF'/><circle cx='23' cy='14' r='9' fill='#1C3F94'/><circle cx='32' cy='23' r='9' fill='#1C3F94'/><circle cx='23' cy='32' r='9' fill='#1C3F94'/><circle cx='14' cy='23' r='9' fill='#1C3F94'/><circle cx='23' cy='23' r='5' fill='#22A6B3'/></svg>`],
];

function secHead(eyebrow, title, urdu, sub) {
  return `<div class="sec-head" data-reveal><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${urdu ? `<div class="urdu">${urdu}</div>` : ""}${sub ? `<p>${sub}</p>` : ""}</div>`;
}
const emptyGrid = (msg) => `<div class="empty-state" style="grid-column:1/-1"><div class="ur">جلد</div><h3>New pieces arriving</h3><p>${msg}</p></div>`;

// ================================================================== HOME
async function home(main) {
  const s = state.store;
  const heroImgs = media("hero").length ? media("hero") : pickImgs(withImg(suits).sort(() => 0.5 - Math.random()), 9);
  const cols = [0, 1, 2].map((k) => heroImgs.filter((_, i) => i % 3 === k));
  const offerLive = Date.now() < Date.parse(s.launchOffer.endsAt);
  const catImg = (f) => withImg(f)[0]?.images[0];
  const cats = [
    ["Women Unstitched", "ان سلا", "/shop?gender=women&category=unstitched", (p) => p.gender === "women" && p.category === "unstitched", "#D6246E", "#F2A900"],
    ["Women Ready to Wear", "تیار", "/shop?gender=women&category=ready-to-wear", (p) => p.gender === "women" && p.category === "ready-to-wear", "#0FA3A3", "#1C2A6B"],
    ["Men Kameez Shalwar", "مردانہ", "/shop?gender=men", (p) => p.gender === "men", "#0B5D4B", "#1C2A6B"],
    ["Aarzu Originals", "آرزو", "/shop?collection=originals", (p) => p.collection === "originals" && suits(p), "#7A1530", "#D6246E"],
    ["Dupattas & Shawls", "دوپٹے", "/shop?category=accessory", (p) => p.category === "accessory", "#F26B1D", "#F2A900"],
    ["Western", "جلد", "/western", () => false, "#6D5BFF", "#FF3D8B"],
  ];
  const originals = withImg((p) => p.collection === "originals" && suits(p));
  const designer = withImg((p) => p.collection !== "originals" && suits(p));
  const accs = withImg((p) => p.category === "accessory");

  main.innerHTML = `
  <section class="hero">
    <div class="pattern"></div><canvas class="petals"></canvas><div class="hero-urdu">آرزو</div>
    <div class="wrap">
      <div>
        <span class="hero-chip fade-up" style="--delay:.1s"><b>New</b> The Aarzu launch season is here</span>
        <h1 class="split"><span class="l1">${splitWords("Pehno apni")}</span><span class="l2 grad-text fade-up" style="--delay:.45s">Aarzu.</span></h1>
        <p class="lede fade-up" style="--delay:.7s">Shalwar kameez with the soul of Pakistan. Designer favourites for less, and our own Originals inspired by ajrak, phulkari, truck art and Multani blue.</p>
        <div class="hero-ctas fade-up" style="--delay:.85s"><a class="btn rani" href="/shop?gender=women" data-link>Shop Women ${icon("arrow-right", "", 16)}</a><a class="btn ghost-light" href="/shop?gender=men" data-link>Shop Men</a></div>
        <div class="hero-trust fade-up" style="--delay:1s"><span>${icon("banknote", "", 18)} Cash on delivery</span><span>${icon("truck", "", 18)} Free over ${rs(s.freeShippingThreshold)}</span><span>${icon("refresh-ccw", "", 18)} ${s.returnDays}-day exchange</span></div>
      </div>
      <div class="arches fade-up" style="--delay:.4s"><div class="medallion"></div>
        ${cols.map((c, k) => `<div class="arch ${c.length ? "" : "empty"}">${c.map((u, i) => `<img src="${esc(img(u))}" class="${i ? "" : "on"}" alt="" referrerpolicy="no-referrer">`).join("")}${k === 1 && c.length ? `<span class="tag">New Season</span>` : ""}</div>`).join("")}
        ${offerLive ? `<div class="hero-offer"><small>Launch offer ends in</small><div class="cdown" id="hero-cd"></div><strong>10% off · ${s.launchOffer.code}</strong></div>` : ""}
      </div>
    </div><div class="jhalar"></div>
  </section>

  <div class="marquee"><div class="marquee-track">${[0, 1].map(() => ["Lawn", "Khaddar", "<span class='ur'>کھدر</span>", "Chiffon", "Karandi", "Cambric", "Raw Silk", "<span class='ur'>لان</span>", "Linen", "Jacquard", "Organza", "Velvet"].map((t) => `<span>${t}</span>`).join("")).join("")}</div></div>

  <section class="sec wrap">
    ${secHead("Shop by category", "Find your <em>aarzu</em>", "اپنی پسند چنیں")}
    <div class="cats">${cats.map(([t, u, h, f, c1, c2], i) => {
      const im = catImg(f);
      const n = P().filter(f).length;
      return `<a class="cat" href="${h}" data-link data-reveal style="--i:${i}"><div class="cat-img"><div class="in">${im ? `<img src="${esc(img(im))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="ph" style="--c1:${c1};--c2:${c2}">${u}</div>`}</div></div><div><b>${t}</b><small>${u}</small></div><span class="count">${h === "/western" ? "Coming soon" : `${n} styles`}</span></a>`;
    }).join("")}</div>
  </section>

  <section class="sec wrap" style="padding-top:0">
    <div class="sec-head-row" data-reveal><div><span class="eyebrow">Just landed</span><h2>New this <em class="grad-text" style="font-style:italic">season</em></h2></div>
      <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap"><div class="tabs" id="new-tabs">${["All", "Women", "Men", "Originals"].map((t, i) => `<button class="${i ? "" : "on"}" data-t="${t}">${t}</button>`).join("")}</div><div class="rail-nav"><button data-r="-1" aria-label="Previous">${icon("chevron-left")}</button><button data-r="1" aria-label="Next">${icon("chevron-right")}</button></div></div></div>
    <div class="rail" id="new-rail"></div>
  </section>

  <section class="wrap"><div class="offer" data-reveal="zoom">
    <div class="offer-copy"><span class="eyebrow" style="color:var(--saffron)">Spin & win</span><h2>Every spin wins <em>something</em></h2>
      <p>Spin the Aarzu wheel once for up to 15% off or free delivery. ${offerLive ? `New here? Code <b>${s.launchOffer.code}</b> also takes 10% off your first order.` : ""}</p>
      ${offerLive ? `<div class="cdown" id="offer-cd"></div>` : ""}
      <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn gold" data-spin>${icon("gift", "", 16)} Spin the wheel</button><a class="btn ghost-light" href="/shop" data-link>Shop everything</a></div></div>
    <div class="offer-vis"><div class="mini-wheel" style="background:conic-gradient(${s.wheel.map((w, i) => `${w.color} ${(i / s.wheel.length) * 100}% ${((i + 1) / s.wheel.length) * 100}%`).join(",")})"></div></div>
  </div></section>

  ${originals.length ? `<section class="sec journey"><div class="wrap">
    ${secHead("Safar-e-Aarzu · Aarzu Originals", "A journey across <em>Pakistan</em>", "سفرِ آرزو", "Our own designs, each born from the craft of a region. Tap a stop on the journey.")}
    <div class="journey-path" data-reveal>${REGIONS.map((r, i) => `<button class="${i ? "" : "on"}" data-reg="${i}" style="--c:${r.c}"><span class="dot"></span><b>${r.key}</b><small>${r.ur}</small></button>`).join("")}</div>
    <div class="journey-stage" id="journey"></div></div></section>` : ""}

  <section class="sec wrap">
    ${secHead("Shop by occasion", "Dressed for every <em>moment</em>", "ہر موقع کے لیے")}
    <div class="occasions">${OCCASIONS.map(([o, u, c], i) => { const im = catImg((p) => (p.occasions || []).includes(o)); return `<a class="occ" href="/shop?occasion=${encodeURIComponent(o)}" data-link data-reveal style="--i:${i};--bg:${c}">${im ? `<img src="${esc(img(im))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="ur">${u}</span><b>${o}</b><span>${P().filter((p) => (p.occasions || []).includes(o)).length} styles →</span></a>`; }).join("")}</div>
  </section>

  <div data-slot="home-mid"></div>
  ${designer.length ? `<section class="sec wrap" style="padding-top:0">
    <div class="sec-head-row" data-reveal><div><span class="eyebrow">The Designer Edit</span><h2>Designer favourites, <em style="color:var(--rani)">${rs(1000)} less</em></h2><p style="margin:8px 0 0;color:var(--ink-2)">The season's most-loved designer suits, hand-picked and quality-checked by our team. Every piece is ${rs(1000)} under its retail price.</p></div><a class="link under" href="/shop?collection=designer" data-link>View all ${icon("arrow-right", "", 16)}</a></div>
    <div class="grid" style="--cols:4">${designer.sort((a, b) => b.compareAt - b.price - (a.compareAt - a.price)).slice(0, 8).map((p, i) => card(p, { i })).join("")}</div>
  </section>` : ""}

  ${originals.length && accs.length ? `<section class="sec wrap" style="padding-top:0">
    ${secHead(state.store.bundle.label, "Pair it, <em>save</em> on it", "مکمل لُک", `Add any dupatta, shawl or scarf to a suit and it's ${s.bundle.percent}% off, applied automatically in your bag.`)}
    <div class="bundle" id="bundle" data-reveal></div></section>` : ""}

  <section class="sec west"><div class="blob a"></div><div class="blob b"></div><div class="blob c"></div><div class="wrap">
    <div data-reveal="left"><span class="eyebrow" style="color:#B9B3FF">Aarzu West</span><h2>Western<span class="soon">Coming soon</span></h2><p>Co-ords, denim, dresses and easy tops, made with the same eye for colour. Join the list for first access and launch-day prices.</p>
      <form class="waitlist" data-wl="western"><input name="contact" placeholder="Email or WhatsApp number" aria-label="Email or WhatsApp"><button class="btn rani sm">Notify me</button></form><p class="wl-msg" style="margin-top:10px;font-size:.86rem"></p></div>
    <div class="west-cards" data-reveal="right">${["Co-ords", "Denim", "Dresses", "Tops", "Outerwear", "Basics"].map((t, i) => { const m = media("western")[i % Math.max(1, media("western").length)]; return `<div class="west-card">${m ? `<img src="${esc(img(m))}" alt="" referrerpolicy="no-referrer">` : `<div class="sil"></div>`}<span class="lock">${icon("lock", "", 14)}</span><b>${t}</b></div>`; }).join("")}</div>
  </div></section>

  <section class="sec wrap">
    ${secHead("Why Aarzu", "Shop with <em>itminan</em>", "اطمینان سے خریدیں")}
    <div class="perks">${[["banknote", "Cash on delivery", "Pay when it reaches your door", "#0B5D4B"], ["truck", "Free delivery", `On orders over ${rs(s.freeShippingThreshold)}`, "#D6246E"], ["refresh-ccw", `${s.returnDays}-day exchange`, "Size or colour, swap it easily", "#F2A900"], ["shield-check", "Quality checked", "Every piece inspected before dispatch", "#1C2A6B"], ["whatsapp", "WhatsApp support", "Real people, quick replies", "#1FA855"], ["package", "Gift-ready packing", "Wrapped with an Aarzu note", "#F26B1D"]].map(([ic, b, t, c], i) => `<div class="perk" data-reveal style="--i:${i}"><span class="ic" style="--c:${c}">${icon(ic, "", 24)}</span><b>${b}</b><span>${t}</span></div>`).join("")}</div>
  </section>

  <section class="sec wrap" style="padding-top:0">
    ${secHead("The Aarzu Journal", "The crafts behind the <em>colour</em>", "ہنر کی کہانی")}
    <div class="crafts">${CRAFTS.map(([t, u, c, d, svg], i) => `<article class="craft" data-reveal style="--i:${i};--c:${c};--tex:${tex(svg)}"><div class="tex"></div><span class="ur">${u}</span><h4>${t}</h4><p>${d}</p></article>`).join("")}</div>
  </section>

  <div data-slot="home-end"></div>
  <section class="wrap"><div class="news" data-reveal="zoom"><div class="big-ur">آرزو</div><span class="eyebrow">Join the Aarzu family</span><h2>Get first look at every <em class="grad-text">drop</em></h2><p>New collections, restocks and member-only offers, straight to your inbox or WhatsApp. No spam, ever.</p>
    <form class="waitlist light" data-wl="newsletter"><input name="contact" placeholder="Email or WhatsApp number" aria-label="Email or WhatsApp"><button class="btn rani sm">Subscribe</button></form><p class="wl-msg" style="margin-top:12px;font-size:.88rem"></p></div></section>`;

  // hero
  const stopPetals = petals($(".petals", main));
  const arches = $$(".arch", main);
  const timer = setInterval(() => arches.forEach((a, k) => setTimeout(() => {
    const ims = $$("img", a); if (ims.length < 2) return;
    const i = ims.findIndex((x) => x.classList.contains("on")); ims[i].classList.remove("on"); ims[(i + 1) % ims.length].classList.add("on");
  }, k * 700)), 4800);
  if (offerLive) { countdown($("#hero-cd", main), s.launchOffer.endsAt); countdown($("#offer-cd", main), s.launchOffer.endsAt); }

  // new-in rail
  const rail = $("#new-rail", main);
  const fill = (t) => {
    const f = { All: suits, Women: (p) => p.gender === "women", Men: (p) => p.gender === "men", Originals: (p) => p.collection === "originals" }[t];
    const list = withImg(f).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 12);
    rail.innerHTML = list.length ? list.map((p, i) => card(p, { i, arched: true })).join("") : emptyGrid("Our first collection is being photographed. Check back very soon.");
    reveal(rail);
  };
  fill("All");
  $("#new-tabs", main).onclick = (e) => { const b = e.target.closest("button"); if (!b) return; $$("#new-tabs button", main).forEach((x) => x.classList.toggle("on", x === b)); fill(b.dataset.t); };
  $$(".rail-nav button", main).forEach((b) => (b.onclick = () => rail.scrollBy({ left: rail.clientWidth * 0.8 * Number(b.dataset.r), behavior: "smooth" })));

  // journey
  const jr = $("#journey", main);
  if (jr) {
    const show = (i) => {
      const r = REGIONS[i];
      const p = originals.find((x) => (r.key === "Chitral & Gilgit" ? /Chitral|Gilgit/.test(x.region) : r.key === "Sindh" ? /Sindh|Thar|Hyderabad|Karachi/.test(x.region) : r.key === "Punjab" ? /Punjab|Lahore|Multan|Islamabad/.test(x.region) : x.region?.includes(r.key.split(" ")[0]))) || originals[i % originals.length];
      jr.innerHTML = `<div class="journey-media swap-in"><img src="${esc(img(p.images[0]))}" alt="${esc(p.title)}"></div>
        <div class="journey-copy swap-in"><div class="region">${r.ur}</div><span class="eyebrow">${esc(r.key)}</span><h3>${esc(p.title)} <span class="urdu" style="font-size:.6em;color:var(--gold)">${esc(p.urdu || "")}</span></h3><p>${r.text}</p><p style="font-family:var(--serif);font-style:italic;font-size:1.2rem">“${esc(p.description)}”</p>
        <div class="craft-list">${r.crafts.map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join("")}</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><a class="btn rani" href="/product/${p.slug}" data-link>Shop ${esc(p.title)} · ${rs(p.price)}</a><a class="link under" href="/shop?collection=originals" data-link>All Originals</a></div></div>`;
    };
    show(0);
    $(".journey-path", main).onclick = (e) => { const b = e.target.closest("[data-reg]"); if (!b) return; $$("[data-reg]", main).forEach((x) => x.classList.toggle("on", x === b)); show(Number(b.dataset.reg)); };
  }

  // bundle builder
  const bd = $("#bundle", main);
  if (bd) {
    let si = 0, ai = 0;
    const draw = () => {
      const a = originals[si], b = accs[ai];
      const save = Math.round((b.price * s.bundle.percent) / 100);
      bd.innerHTML = `<div class="bundle-item"><a class="card-media" href="/product/${a.slug}" data-link style="border-radius:16px"><img class="main" src="${esc(img(a.images[0]))}" alt=""></a><b class="serif" style="font-size:1.2rem">${esc(a.title)}</b><span>${rs(a.price)}</span><div class="bundle-picks">${originals.slice(0, 6).map((p, i) => `<button class="${i === si ? "on" : ""}" data-s="${i}"><img src="${esc(img(p.images[0]))}" alt="${esc(p.title)}"></button>`).join("")}</div></div>
        <span class="bundle-plus">+</span>
        <div class="bundle-item"><a class="card-media" href="/product/${b.slug}" data-link style="border-radius:16px"><img class="main" src="${esc(img(b.images[0]))}" alt=""></a><b class="serif" style="font-size:1.2rem">${esc(b.title)}</b><span><s style="color:var(--muted)">${rs(b.price)}</s> <b style="color:var(--rani)">${rs(b.price - save)}</b></span><div class="bundle-picks">${accs.slice(0, 6).map((p, i) => `<button class="${i === ai ? "on" : ""}" data-a="${i}"><img src="${esc(img(p.images[0]))}" alt="${esc(p.title)}"></button>`).join("")}</div></div>
        <span class="bundle-plus">=</span>
        <div class="bundle-sum"><span class="eyebrow">The complete look</span><span class="big">${rs(a.price + b.price - save)}</span><span style="color:var(--emerald);font-weight:600">You save ${rs(save)}</span><button class="btn rani" data-bundle>Add both to bag</button><small style="color:var(--muted)">Size for ready-to-wear: you'll pick it in your bag or on the product page.</small></div>`;
    };
    draw();
    bd.onclick = (e) => {
      const x = e.target.closest("[data-s],[data-a],[data-bundle]");
      if (!x) return;
      if (x.dataset.s) si = Number(x.dataset.s);
      if (x.dataset.a) ai = Number(x.dataset.a);
      if (x.hasAttribute("data-bundle")) {
        const a = originals[si], b = accs[ai];
        const sz = a.sizes.find((z) => a.stock[z] > 0);
        addToCart(a.id, sz); addToCart(b.id, b.sizes[0]);
        flyToCart($("img", bd));
        toast(`Complete look added: ${esc(a.title)} + ${esc(b.title)}`, { img: a.images[0], action: "View bag", actionData: "open-cart" });
        return;
      }
      draw();
    };
  }
  waitlists(main);
  return () => { clearInterval(timer); stopPetals(); };
}

function waitlists(root) {
  $$("form[data-wl]", root).forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const msg = f.nextElementSibling;
    try {
      const r = await api(`/api/${f.dataset.wl === "western" ? "waitlist" : "newsletter"}`, { contact: f.contact.value, interest: f.dataset.wl });
      msg.innerHTML = f.dataset.wl === "western" ? `✨ You're <b>#${r.position}</b> on the Aarzu West list${r.already ? " (already signed up)" : ""}. We'll message you first.` : `✨ Shukriya! You're in${r.already ? " (already subscribed)" : ""}.`;
      f.reset();
      if (!r.already) confetti(90);
    } catch (err) { msg.textContent = err.message; }
  }));
}

// ================================================================== SHOP
let filtersOpen = false; // keeps the mobile filter drawer open while filters re-render
const FILTERS = ["gender", "category", "collection", "fabric", "pieces", "occasion", "color", "q", "min", "max", "sort", "instock"];
function shop(main, { url, go, replace }) {
  if (!replace) filtersOpen = false;
  const q = Object.fromEntries(FILTERS.map((k) => [k, url.searchParams.get(k) || ""]));
  const all = withImg();
  const title = q.q ? `“${esc(q.q)}”` : q.collection === "originals" ? "Aarzu Originals" : q.collection === "designer" ? "The Designer Edit" : q.category === "accessory" ? "Dupattas & Shawls" : q.occasion ? `${esc(q.occasion)} Edit` : q.gender === "women" ? "Women" : q.gender === "men" ? "Men" : "Shop All";
  const urdu = { Women: "خواتین", Men: "مرد", "Aarzu Originals": "آرزو اوریجنلز", "Dupattas & Shawls": "دوپٹے اور شالیں" }[title] || "آرزو";
  const prices = all.map((p) => p.price);
  const lo = Math.floor((Math.min(...prices, 1000) || 0) / 500) * 500, hi = Math.ceil((Math.max(...prices, 20000) || 20000) / 500) * 500;
  // skip = the facet being counted, so its own options stay selectable
  const matches = (p, skip) => {
    const has = (k, v) => k === skip || !q[k] || q[k].split(",").includes(String(v));
    const anyOf = (k, arr) => k === skip || !q[k] || q[k].split(",").some((x) => (arr || []).includes(x));
    if (!has("gender", p.gender) && !(q.gender && p.gender === "unisex")) return false;
    if (!has("category", p.category)) return false;
    if (!has("collection", p.collection === "originals" ? "originals" : "designer")) return false;
    if (!has("fabric", p.fabric) || !has("pieces", p.pieces) || !anyOf("occasion", p.occasions) || !anyOf("color", p.colors)) return false;
    if (q.min && p.price < Number(q.min)) return false;
    if (q.max && p.price > Number(q.max)) return false;
    if (q.instock && !stockLeft(p)) return false;
    if (q.q) { const t = q.q.toLowerCase().replace(/s$/, ""); if (![p.title, p.urdu, p.fabric, p.category, p.gender, p.region, p.motif, p.accessoryType, ...(p.colors || []), ...(p.occasions || [])].join(" ").toLowerCase().includes(t)) return false; }
    return true;
  };
  const facet = (k, get) => {
    const m = new Map();
    for (const p of all) if (matches(p, k)) for (const v of [].concat(get(p) || [])) m.set(String(v), (m.get(String(v)) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const g = (k, label, get, fmt = (x) => x) => {
    const opts = facet(k, get);
    if (!opts.length) return "";
    const cur = q[k].split(",").filter(Boolean);
    return `<div class="fgroup"><h6>${label}</h6>${opts.map(([v, n]) => `<label class="check"><input type="checkbox" data-f="${k}" value="${esc(v)}" ${cur.includes(v) ? "checked" : ""}>${esc(fmt(v))}<span class="n">${n}</span></label>`).join("")}</div>`;
  };
  main.innerHTML = `<section class="phero"><div class="crumbs"><a href="/" data-link>Home</a> / <span>Shop</span></div><h1>${title}</h1><div class="urdu">${urdu}</div></section>
  <div class="wrap shop">
    <aside class="filters" id="filters"><div style="display:flex;justify-content:space-between;align-items:center"><b class="serif" style="font-size:1.6rem">Filter</b><button class="link" id="clear-f">Clear all</button></div>
      ${g("gender", "Shop for", (p) => p.gender, (v) => ({ women: "Women", men: "Men", unisex: "Unisex" })[v] || v)}
      ${g("category", "Type", (p) => p.category, (v) => ({ unstitched: "Unstitched", "ready-to-wear": "Ready to wear", accessory: "Dupattas & Shawls" })[v] || v)}
      ${g("collection", "Collection", (p) => (p.collection === "originals" ? "originals" : "designer"), (v) => (v === "originals" ? "Aarzu Originals" : "Designer Edit"))}
      ${g("fabric", "Fabric", (p) => p.fabric)}
      ${g("pieces", "Pieces", (p) => (p.category === "accessory" ? null : p.pieces), (v) => `${v}-Piece`)}
      ${g("occasion", "Occasion", (p) => p.occasions)}
      <div class="fgroup"><h6>Colour</h6><div class="fopts">${facet("color", (p) => p.colors).slice(0, 16).map(([c]) => `<button class="color-dot ${q.color.split(",").includes(c) ? "on" : ""}" data-color="${esc(c)}" title="${esc(c)}" style="background:${colorCss(c)}"></button>`).join("")}</div></div>
      <div class="fgroup"><h6>Price</h6><div class="range"><div class="range-vals"><span id="pmin">${rs(q.min || lo)}</span><span id="pmax">${rs(q.max || hi)}</span></div><div class="dual"><div class="track"></div><div class="fill" id="pfill"></div><input type="range" id="rmin" min="${lo}" max="${hi}" step="250" value="${q.min || lo}" aria-label="Minimum price"><input type="range" id="rmax" min="${lo}" max="${hi}" step="250" value="${q.max || hi}" aria-label="Maximum price"></div></div></div>
      <div class="fgroup"><label class="check"><input type="checkbox" data-f="instock" value="1" ${q.instock ? "checked" : ""}>In stock only</label></div>
      <button class="btn block filter-toggle" data-close-f style="margin-top:16px">Show results</button>
    </aside>
    <div>
      <div class="toolbar"><div style="display:flex;gap:10px;align-items:center"><button class="btn ghost sm filter-toggle" id="open-f">${icon("sliders-horizontal", "", 16)} Filter</button><span class="count" id="count"></span></div>
        <div style="display:flex;gap:10px;align-items:center"><div class="select"><select id="sort" aria-label="Sort">${[["", "Featured"], ["new", "Newest"], ["low", "Price: low to high"], ["high", "Price: high to low"], ["save", "Biggest savings"], ["rating", "Top rated"]].map(([v, l]) => `<option value="${v}" ${q.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select>${icon("chevron-down", "", 16)}</div>
        <div class="density">${[3, 4].map((n) => `<button data-cols="${n}" class="${n === 4 ? "on" : ""}" aria-label="${n} columns">${icon(n === 3 ? "list" : "sliders-horizontal", "", 16)}</button>`).join("")}</div></div></div>
      <div class="active-filters" id="chips"></div>
      <div class="grid" id="grid" style="--cols:4"></div>
      <div class="load-more" id="more"></div>
    </div></div>`;

  if (filtersOpen) $("#filters", main).classList.add("on");
  const set = (k, v) => { const u = new URL(location.href); v ? u.searchParams.set(k, v) : u.searchParams.delete(k); go(u.pathname + u.search, true); };
  let shown = 16;
  const list = all.filter((p) => matches(p));
  const sorters = { new: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt), low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, save: (a, b) => (b.compareAt || b.price) - b.price - ((a.compareAt || a.price) - a.price), rating: (a, b) => (b.rating?.avg || 0) - (a.rating?.avg || 0) };
  if (sorters[q.sort]) list.sort(sorters[q.sort]);
  else list.sort((a, b) => (stockLeft(b) > 0) - (stockLeft(a) > 0) || (b.sold || 0) - (a.sold || 0));

  const draw = () => {
    $("#count", main).innerHTML = `<b>${list.length}</b> ${list.length === 1 ? "style" : "styles"}`;
    $("#grid", main).innerHTML = list.length ? list.slice(0, shown).map((p, i) => card(p, { i: i % 8 })).join("") : `<div class="empty-state" style="grid-column:1/-1"><div class="ur">افسوس</div><h3>No matches yet</h3><p>Try removing a filter. New pieces land every week.</p><button class="btn ghost" id="clear-2">Clear filters</button></div>`;
    $("#more", main).innerHTML = list.length > shown ? `<span style="color:var(--muted);font-size:.86rem">Showing ${shown} of ${list.length}</span><div class="bar"><i style="width:${(shown / list.length) * 100}%"></i></div><button class="btn ghost" id="more-btn">Load more</button>` : "";
    reveal(main);
    $("#more-btn", main)?.addEventListener("click", () => { shown += 16; draw(); });
    $("#clear-2", main)?.addEventListener("click", () => go("/shop", true));
  };
  draw();
  const chips = FILTERS.filter((k) => q[k] && !["sort", "min", "max"].includes(k)).flatMap((k) => q[k].split(",").map((v) => [k, v]));
  $("#chips", main).innerHTML = chips.map(([k, v]) => `<button class="chip" data-rm="${k}|${esc(v)}">${esc(k === "instock" ? "In stock" : k === "collection" ? (v === "originals" ? "Originals" : "Designer Edit") : k === "gender" ? ({ women: "Women", men: "Men", unisex: "Unisex" })[v] || v : k === "category" ? ({ unstitched: "Unstitched", "ready-to-wear": "Ready to wear", accessory: "Dupattas & Shawls" })[v] || v : k === "pieces" ? `${v}-Piece` : k === "q" ? `“${v}”` : v)} ${icon("x", "", 14)}</button>`).join("");

  main.addEventListener("change", (e) => {
    const c = e.target.closest("[data-f]");
    if (c) { const k = c.dataset.f; const cur = new Set(q[k].split(",").filter(Boolean)); c.checked ? cur.add(c.value) : cur.delete(c.value); set(k, [...cur].join(",")); }
    if (e.target.id === "sort") set("sort", e.target.value);
    if (e.target.id === "rmin" || e.target.id === "rmax") { const u = new URL(location.href); u.searchParams.set("min", $("#rmin", main).value); u.searchParams.set("max", $("#rmax", main).value); go(u.pathname + u.search, true); }
  });
  const fillRange = () => { const a = Number($("#rmin", main).value), b = Number($("#rmax", main).value); $("#pfill", main).style.cssText = `left:${((a - lo) / (hi - lo)) * 100}%;right:${100 - ((b - lo) / (hi - lo)) * 100}%`; $("#pmin", main).textContent = rs(Math.min(a, b)); $("#pmax", main).textContent = rs(Math.max(a, b)); };
  main.addEventListener("input", (e) => /rmin|rmax/.test(e.target.id) && fillRange());
  fillRange();
  main.addEventListener("click", (e) => {
    const cd = e.target.closest("[data-color]");
    if (cd) { const cur = new Set(q.color.split(",").filter(Boolean)); cur.has(cd.dataset.color) ? cur.delete(cd.dataset.color) : cur.add(cd.dataset.color); set("color", [...cur].join(",")); }
    const rm = e.target.closest("[data-rm]");
    if (rm) { const [k, v] = rm.dataset.rm.split("|"); set(k, q[k].split(",").filter((x) => x !== v).join(",")); }
    const d = e.target.closest("[data-cols]");
    if (d) { $("#grid", main).style.setProperty("--cols", d.dataset.cols); $$("[data-cols]", main).forEach((x) => x.classList.toggle("on", x === d)); }
    if (e.target.closest("#clear-f")) go(location.pathname, true);
    if (e.target.closest("#open-f")) { filtersOpen = true; $("#filters", main).classList.add("on"); }
    if (e.target.closest("[data-close-f]")) { filtersOpen = false; $("#filters", main).classList.remove("on"); }
  });
}

// ================================================================== PRODUCT
function product(main, { params, go }) {
  const p = state.bySlug[params[0]];
  if (!p) return notFound(main);
  pushRecent(p.id);
  const s = state.store;
  let size = p.sizes.length === 1 ? p.sizes[0] : null, qty = 1, active = 0;
  const left = (z) => p.stock?.[z] ?? 0;
  const related = withImg((x) => x.id !== p.id && x.gender === p.gender && x.category === p.category).slice(0, 4);
  const looks = withImg((x) => x.category === "accessory" && x.id !== p.id).slice(0, 4);
  const recent = state.recent.map((id) => state.byId[id]).filter((x) => x && x.id !== p.id).slice(0, 4);
  const city = localStorage.getItem("az_city") || s.cities[0].name;
  const msg = encodeURIComponent(`Assalam o Alaikum! I'd like to order "${p.title}" (${rs(p.price)}). ${location.origin}/product/${p.slug}`);
  const q = quote();
  const nextTier = suitsOnly(p) && (s.multiBuy || []).find((t) => q.suitQty + 1 < t.minItems + 1 && q.suitQty + 1 >= t.minItems - 0);

  main.innerHTML = `<div class="wrap"><div class="crumbs" style="justify-content:flex-start;margin-top:22px"><a href="/" data-link>Home</a> / <a href="/shop?gender=${p.gender}" data-link>${p.gender === "men" ? "Men" : p.gender === "women" ? "Women" : "Shop"}</a> / <span>${esc(p.title)}</span></div>
  <div class="pdp">
    <div class="gallery"><div class="thumbs">${p.images.map((u, i) => `<button class="${i ? "" : "on"}" data-img="${i}"><img src="${esc(img(u))}" alt="" referrerpolicy="no-referrer"></button>`).join("")}</div>
      <div class="stage" id="stage"><img id="main-img" src="${esc(img(p.images[0]))}" alt="${esc(p.title)}" referrerpolicy="no-referrer">${badgesFor(p)}<button class="icon-btn expand" style="background:#fff" id="expand" aria-label="Full screen">${icon("maximize-2", "", 18)}</button></div></div>
    <div class="pinfo">
      <div class="kicker"><span>${esc(typeLabel(p))}</span>·<span>${esc(p.fabric)}</span>${p.region ? `·<span>${esc(p.region)}</span>` : ""}${p.rating ? `·${stars(p.rating)}` : ""}</div>
      <h1>${esc(p.title)}${p.urdu ? `<span class="ur">${esc(p.urdu)}</span>` : ""}</h1>
      <div class="pprice"><b>${rs(p.price)}</b>${p.compareAt > p.price ? `<s>${rs(p.compareAt)}</s><span class="save">You save ${rs(p.compareAt - p.price)}</span>` : ""}<small>Price includes all taxes · Pay cash on delivery</small></div>
      <div id="live"></div>
      ${p.sizes.length > 1 ? `<div><div class="opt-label"><span>Size: <span id="sz-l">${size || "choose"}</span></span><button id="sg">Size guide</button></div><div class="sizes" id="sizes">${p.sizes.map((z) => `<button data-sz="${esc(z)}" ${left(z) > 0 ? "" : "disabled"}>${esc(z)}</button>`).join("")}</div></div>` : ""}
      <div id="stock"></div>
      <div data-slot="pdp-options" data-pid="${p.id}"></div>
      <div class="buy-row"><div class="qty"><button data-qd="-1" aria-label="Less">${icon("minus", "", 16)}</button><span id="qty">1</span><button data-qd="1" aria-label="More">${icon("plus", "", 16)}</button></div><button class="btn rani" id="add" ${stockLeft(p) ? "" : "disabled"}>${icon("shopping-bag", "", 18)} ${stockLeft(p) ? `Add to bag · ${rs(p.price)}` : "Sold out"}</button></div>
      <div class="buy-alt"><button class="btn ghost" id="buy">Buy it now</button><a class="btn wa" href="https://wa.me/${s.contact.whatsapp}?text=${msg}" target="_blank" rel="noopener">${icon("whatsapp", "", 18)} Order on WhatsApp</a></div>
      <div data-slot="pdp-actions" data-pid="${p.id}"></div>
      ${nextTier && q.suitQty >= 1 ? `<div class="nudge">${icon("sparkles")}<span>Add this and you'll have <b>${q.suitQty + 1} suits</b>: <b>${nextTier.percent}% off</b> all of them.</span></div>` : suitsOnly(p) && s.multiBuy?.length ? `<div class="nudge">${icon("badge-percent")}<span>Buy <b>${s.multiBuy[0].minItems} suits</b>, save <b>${s.multiBuy[0].percent}%</b> · Buy <b>${s.multiBuy.at(-1).minItems}+</b>, save <b>${s.multiBuy.at(-1).percent}%</b></span></div>` : ""}
      <div class="delivery" id="delivery"></div>
      <div>
        <details class="acc" open><summary>The story ${icon("plus", "", 16)}</summary><div class="body"><div class="story">${esc(p.description)}</div></div></details>
        <details class="acc"><summary>What's included ${icon("plus", "", 16)}</summary><div class="body"><ul>${(p.details || []).map((d) => `<li>${esc(d)}</li>`).join("")}</ul></div></details>
        <details class="acc"><summary>Fabric & care ${icon("plus", "", 16)}</summary><div class="body"><ul><li>Fabric: ${esc(p.fabric)}</li><li>Gentle hand or machine wash in cold water, separately.</li><li>Dry in shade, iron on the reverse side.</li><li>Slight colour variation from photos may occur due to lighting.</li></ul></div></details>
        <details class="acc"><summary>Delivery & exchange ${icon("plus", "", 16)}</summary><div class="body"><ul><li>Free delivery over ${rs(s.freeShippingThreshold)}, otherwise ${rs(s.shippingFee)}.</li><li>Cash on delivery available nationwide.</li><li>${s.returnDays}-day exchange on unworn items with tags.</li></ul></div></details>
        <div data-slot="pdp-after" data-pid="${p.id}"></div>
      </div>
    </div></div>
  ${looks.length && suitsOnly(p) ? `<section class="sec" style="padding-bottom:0"><div class="sec-head-row"><div><span class="eyebrow">${esc(s.bundle.label)}</span><h2>Finish it with a <em style="color:var(--rani)">dupatta</em></h2><p style="margin:6px 0 0;color:var(--ink-2)">${s.bundle.percent}% off any accessory bought with a suit, applied automatically.</p></div></div><div class="grid" style="--cols:4">${looks.map((x, i) => card(x, { i })).join("")}</div></section>` : ""}
  <section class="sec" style="padding-bottom:0" id="reviews"></section>
  ${related.length ? `<section class="sec" style="padding-bottom:0"><div class="sec-head-row"><h2>You may also <em style="color:var(--rani)">love</em></h2></div><div class="grid" style="--cols:4">${related.map((x, i) => card(x, { i, arched: true })).join("")}</div></section>` : ""}
  ${recent.length ? `<section class="sec" style="padding-bottom:0"><div class="sec-head-row"><h2>Recently viewed</h2></div><div class="grid" style="--cols:4">${recent.map((x, i) => card(x, { i })).join("")}</div></section>` : ""}
  </div>
  <div class="sticky-buy" id="sticky"><img src="${esc(img(p.images[0]))}" alt="" referrerpolicy="no-referrer"><div class="t"><b>${esc(p.title)}</b>${rs(p.price)}</div><button class="btn rani sm" id="add2">Add to bag</button></div>`;

  const stockUi = () => {
    const n = size ? left(size) : stockLeft(p);
    $("#stock", main).innerHTML = n > 0 && n <= 5 ? `<div class="stockbar"><span>🔥 Only <b>${n} left</b>${size && p.sizes.length > 1 ? ` in ${esc(size)}` : ""}. Order soon.</span><div class="b"><i style="width:${(n / 12) * 100}%"></i></div></div>` : n > 5 ? `<div class="stockbar ok"><span>${icon("circle-check", "", 15)} In stock, ready to dispatch</span></div>` : "";
  };
  const delivery = (c) => {
    const d = dispatchInfo(c);
    $("#delivery", main).innerHTML = `<div class="row">${icon("truck")}<span>Delivery to <select id="city">${s.cities.map((x) => `<option ${x.name === d.city ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select> by <b>${d.eta}</b></span></div>
      ${d.sameDay ? `<div class="row">${icon("clock")}<span class="cut">Order within ${d.left} for same-day dispatch</span></div>` : ""}
      <div class="row">${icon("banknote")}<span>Cash on delivery · ${icon("refresh-ccw", "", 14)} ${s.returnDays}-day exchange</span></div>`;
  };
  stockUi();
  delivery(city);

  const pick = (i) => { active = i; $("#main-img", main).src = img(p.images[i]); $$("[data-img]", main).forEach((b, k) => b.classList.toggle("on", k === i)); };
  const add = (buy) => {
    if (!size) { const el = $("#sizes", main); el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); toast("Please choose your size first", { icon: "ruler" }); return; }
    if (left(size) < qty) return toast(`Only ${left(size)} left in ${esc(size)}`);
    const extra = { addons: [], meta: undefined };
    try {
      for (const fn of ext.lineOptions) {
        const o = fn(p, main) || {};
        if (o.addons) extra.addons.push(...o.addons);
        if (o.meta) extra.meta = { ...(extra.meta || {}), ...o.meta };
      }
    } catch (err) { return toast(esc(err.message), { icon: "x" }); }
    addToCart(p.id, size, qty, extra);
    if (buy) return go("/checkout");
    flyToCart($("#main-img", main));
    toast(`<b>${esc(p.title)}</b> added to your bag`, { img: p.images[0], action: "View bag", actionData: "open-cart" });
  };
  main.addEventListener("click", (e) => {
    const t = e.target;
    const im = t.closest("[data-img]"); if (im) pick(Number(im.dataset.img));
    const sz = t.closest("[data-sz]"); if (sz) { size = sz.dataset.sz; $$("[data-sz]", main).forEach((b) => b.classList.toggle("on", b === sz)); $("#sz-l", main).textContent = size; stockUi(); }
    const qd = t.closest("[data-qd]"); if (qd) { qty = Math.max(1, Math.min(10, qty + Number(qd.dataset.qd))); $("#qty", main).textContent = qty; }
    if (t.closest("#add") || t.closest("#add2")) add(false);
    if (t.closest("#buy")) add(true);
    if (t.closest("#sg")) sizeGuideModal();
    if (t.closest("#expand")) openOverlay(`<img src="${esc(img(p.images[active]))}" alt="" style="width:100%;border-radius:26px" referrerpolicy="no-referrer">`, { width: 760 });
  });
  main.addEventListener("change", (e) => { if (e.target.id === "city") { localStorage.setItem("az_city", e.target.value); delivery(e.target.value); } });
  const stage = $("#stage", main);
  stage.addEventListener("mousemove", (e) => { const r = stage.getBoundingClientRect(); $("#main-img", main).style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`; });
  stage.addEventListener("click", (e) => !e.target.closest("button") && stage.classList.toggle("zoom"));
  stage.addEventListener("mouseleave", () => stage.classList.remove("zoom"));

  // Real live viewers (other open sessions on this product)
  const beat = async () => { try { const r = await api("/api/presence", { productId: p.id, sid }); $("#live", main).innerHTML = r.others > 0 ? `<span class="live"><i></i>${r.others} ${r.others === 1 ? "other person is" : "others are"} viewing this right now</span>` : ""; } catch {} };
  beat();
  const hb = setInterval(beat, 15000);
  const sticky = $("#sticky", main);
  const so = new IntersectionObserver(([e]) => sticky.classList.toggle("on", !e.isIntersecting && e.boundingClientRect.top < 0));
  so.observe($("#add", main));
  reviews($("#reviews", main), p);
  return () => { clearInterval(hb); so.disconnect(); sticky.remove(); };
}
const suitsOnly = (p) => p.category !== "accessory";
function badgesFor(p) { return `<div class="badges">${p.collection === "originals" ? `<span class="badge orig">Aarzu Original</span>` : ""}${p.compareAt > p.price ? `<span class="badge save">Save ${rs(p.compareAt - p.price)}</span>` : ""}</div>`; }

async function reviews(el, p) {
  let list = [];
  try { list = await api(`/api/reviews/${p.id}`); } catch {}
  const avg = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0;
  el.innerHTML = `<div class="sec-head-row"><div><span class="eyebrow">Reviews</span><h2>What shoppers <em style="color:var(--rani)">say</em></h2></div></div><div class="reviews">
    <div class="rev-sum">${list.length ? `<div class="avg">${avg}</div>${stars({ avg, count: list.length })}<span style="color:var(--muted)">Based on ${list.length} review${list.length > 1 ? "s" : ""}</span>` : `<b class="serif" style="font-size:1.6rem">No reviews yet</b><span style="color:var(--muted)">Bought this piece? Be the first to share how it looks on you.</span>`}
      <form id="rev-f" style="display:grid;gap:12px;margin-top:10px"><div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="st${n}" value="${n}"><label for="st${n}" title="${n} stars">★</label>`).join("")}</div>
        <div class="field"><input name="name" placeholder="Your name" required></div><div class="field"><input name="city" placeholder="City (optional)"></div><div class="field"><textarea name="text" placeholder="How was the fabric, fit and colour?" required></textarea></div><button class="btn rani">Post review</button></form></div>
    <div class="rev-list">${list.length ? list.map((r) => `<article class="rev"><header><b>${esc(r.name)}${r.city ? ` · <span style="font-family:var(--sans);font-size:.8rem;color:var(--muted)">${esc(r.city)}</span>` : ""}</b><time>${new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time></header>${stars({ avg: r.rating, count: 1 }, false)}<p>${esc(r.text)}</p></article>`).join("") : `<div class="empty-state" style="padding:40px"><div class="ur">رائے</div><p>Reviews from real customers appear here.</p></div>`}</div></div>`;
  $("#rev-f", el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await api(`/api/reviews/${p.id}`, { name: f.name.value, city: f.city.value, text: f.text.value, rating: f.rating.value }); toast("Shukriya! Your review is live."); reviews(el, p); }
    catch (err) { toast(esc(err.message)); }
  };
}

function sizeGuideModal() {
  openOverlay(`<div style="padding:34px"><span class="eyebrow">Size guide</span><h3 style="font-size:2.2rem;margin:10px 0 18px">Find your fit</h3>${sizeTables()}</div>`, { width: 720 });
}
const sizeTables = () => `<h4 class="serif" style="font-size:1.4rem;margin:0 0 10px">Women · ready to wear (inches)</h4><table class="table"><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Hip</th><th>Shirt length</th></tr>${[["XS", 34, 30, 37, 40], ["S", 36, 32, 39, 41], ["M", 38, 34, 41, 42], ["L", 41, 37, 44, 43], ["XL", 44, 40, 47, 44]].map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>
  <h4 class="serif" style="font-size:1.4rem;margin:24px 0 10px">Men · kameez shalwar (inches)</h4><table class="table"><tr><th>Size</th><th>Chest</th><th>Shoulder</th><th>Sleeve</th><th>Kameez length</th></tr>${[["S", 40, 17.5, 24, 40], ["M", 42, 18, 24.5, 41], ["L", 44, 18.5, 25, 42], ["XL", 46, 19, 25.5, 43], ["XXL", 48, 19.5, 26, 44]].map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>
  <p style="color:var(--muted);font-size:.86rem;margin-top:14px">Between sizes? Choose the larger size for a relaxed fit, or message us on WhatsApp for advice.</p>`;

// ================================================================== CHECKOUT
function checkout(main, { go }) {
  const s = state.store;
  const q0 = quote();
  if (!q0.items.length) { main.innerHTML = `<div class="wrap empty-state"><div class="ur">خالی</div><h3>Your bag is empty</h3><a class="btn rani" href="/shop" data-link>Shop now</a></div>`; return; }
  const saved = (() => { try { return JSON.parse(localStorage.getItem("az_cust")) || {}; } catch { return {}; } })();
  main.innerHTML = `<section class="wrap"><div class="steps" style="margin-top:30px"><span class="on"><b>1</b>Bag</span><i class="ln"></i><span class="on"><b>2</b>Details</span><i class="ln"></i><span><b>3</b>Done</span></div>
  <div class="checkout"><form id="co" novalidate>
    <div class="co-sec"><h3><span class="n">1</span>Contact</h3><div class="row2"><div class="field" data-k="name"><label>Full name</label><input name="name" autocomplete="name" value="${esc(saved.name || "")}"><span class="msg"></span></div><div class="field" data-k="phone"><label>Mobile number</label><input name="phone" inputmode="tel" autocomplete="tel" placeholder="03XX XXXXXXX" value="${esc(saved.phone || "")}"><span class="msg"></span></div></div>
      <div class="field" data-k="email"><label>Email (optional)</label><input name="email" type="email" autocomplete="email" value="${esc(saved.email || "")}"><span class="msg"></span></div></div>
    <div class="co-sec"><h3><span class="n">2</span>Delivery</h3><div class="row2"><div class="field" data-k="city"><label>City</label><select name="city">${s.cities.map((c) => `<option ${c.name === (saved.city || localStorage.getItem("az_city")) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><span class="msg"></span></div><div class="field"><label>Arrives</label><input id="eta" disabled></div></div>
      <div class="field" data-k="address"><label>Full address</label><textarea name="address" autocomplete="street-address" placeholder="House, street, area, landmark">${esc(saved.address || "")}</textarea><span class="msg"></span></div>
      <div class="field"><label>Order notes (optional)</label><input name="notes" placeholder="e.g. call before delivery"></div></div>
    <div data-slot="checkout-extras"></div>
    <div class="co-sec" style="border:0"><h3><span class="n">3</span>Payment</h3>
      ${[["cod", "Cash on delivery", "Pay in cash when your order arrives", "Most popular"], ["bank", "Bank transfer", "Account details shown after you order", ""], ["wallet", "JazzCash / Easypaisa", "Wallet number shown after you order", ""]].map(([v, b, t, tag], i) => `<label class="pay-opt" data-pay="${v}"><input type="radio" name="payment" value="${v}" ${i ? "" : "checked"}><span><b>${b}</b><small>${t}</small></span>${tag ? `<span class="tag">${tag}</span>` : "<span></span>"}</label>`).join("")}
      <p class="cod-note" id="cod-note" hidden></p>
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <button class="btn rani block" id="place" style="margin-top:20px;min-height:58px">${icon("lock", "", 16)} Place order</button>
      <p style="text-align:center;font-size:.8rem;color:var(--muted)">By placing your order you agree to our delivery & exchange policy.</p></div>
  </form>
  <aside class="summary" id="summary"></aside></div></section>`;
  const f = $("#co", main);
  const sum = () => {
    const q = quote();
    $("#summary", main).innerHTML = `<h3>Order summary</h3><div class="sum-items">${q.items.map((i) => `<div class="sum-item"><div class="ph"><img src="${esc(img(i.image))}" alt="" referrerpolicy="no-referrer"><span class="q">${i.qty}</span></div><div><b>${esc(i.title)}</b><span style="color:var(--muted)">${esc(i.size)}</span>${lineExtras(i)}</div><span>${rs(i.line)}</span></div>`).join("")}</div>
      <div data-slot="checkout-credits"></div>
      <form class="coupon" id="cpn"><input name="code" placeholder="Discount code" value="${esc(state.coupon?.code || "")}"><button class="btn sm ghost">Apply</button></form>
      ${q.couponRejected ? `<small style="color:#D0313F">${esc(q.couponRejected)}</small>` : ""}
      <div class="sumline"><span>Subtotal</span><span>${rs(q.subtotal)}</span></div>${q.discounts.map((d) => `<div class="sumline disc"><span>${esc(d.label)}</span><span>−${rs(d.amount)}</span></div>`).join("")}
      <div class="sumline"><span>Delivery</span><span>${q.shipping ? rs(q.shipping) : "FREE"}</span></div>${q.credits.map((c) => `<div class="sumline disc"><span>${esc(c.label)}</span><span>−${rs(c.amount)}</span></div>`).join("")}<div class="sumline total"><span>Total</span><span>${rs(q.total)}</span></div>
      ${q.savings > 0 ? `<div class="savings-pill">${icon("badge-percent", "", 16)} You're saving ${rs(q.savings)}</div>` : ""}
      <div class="trust-mini"><span>${icon("shield-check", "", 14)} Secure checkout</span><span>${icon("refresh-ccw", "", 14)} ${s.returnDays}-day exchange</span></div>`;
    fillSlots($("#summary", main), { quote: q, refresh: sum });
    // Cash-on-delivery rules (same as the server's): stitched-to-measure and very large orders need an advance
    const rules = s.cod || {};
    const codWhy = rules.maxTotal && q.total > rules.maxTotal ? `Cash on delivery is available up to ${rs(rules.maxTotal)}.` : rules.advanceForAddons?.length && q.items.some((i) => (i.addons || []).some((a) => rules.advanceForAddons.includes(a.key))) ? "Stitched-to-measure orders are made just for you, so they need advance payment." : "";
    const codInput = $('[data-pay="cod"] input', main);
    codInput.disabled = !!codWhy;
    $('[data-pay="cod"]', main).classList.toggle("off", !!codWhy);
    if (codWhy && codInput.checked) $('[data-pay="bank"] input', main).checked = true;
    const note = $("#cod-note", main);
    note.hidden = !codWhy;
    note.textContent = codWhy ? `${codWhy} Please choose bank transfer or JazzCash/Easypaisa.` : "";
    $("#place", main).innerHTML = `${icon("lock", "", 16)} Place order · ${rs(q.total)}`;
    $("#cpn", main).onsubmit = async (e) => { e.preventDefault(); const code = e.target.code.value.trim(); try { const c = code ? await api("/api/coupon", { code, phone: f.phone.value }) : null; (await import("./core.js")).setCoupon(c); sum(); if (c) toast("Code applied ✨"); } catch (err) { toast(esc(err.message)); } };
  };
  sum();
  const eta = () => ($("#eta", main).value = dispatchInfo(f.city.value).eta);
  eta();
  f.city.onchange = eta;
  f.onsubmit = async (e) => {
    e.preventDefault();
    $$(".field", f).forEach((x) => x.classList.remove("err"));
    const btn = $("#place", main);
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span> Placing order…`;
    const customer = { name: f.name.value, phone: f.phone.value, email: f.email.value, city: f.city.value, address: f.address.value, notes: f.notes.value };
    try {
      const r = await api("/api/orders", { customer, website: f.website.value, payment: f.payment.value, items: state.cart, code: state.coupon?.code, credits: state.credits.map((c) => ({ key: c.key, payload: c.payload })) });
      localStorage.setItem("az_cust", JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email, city: customer.city, address: customer.address }));
      sessionStorage.setItem("az_last", JSON.stringify({ ...r, quote: quote(), customer }));
      clearCart();
      (await import("./core.js")).setCoupon(null);
      for (const c of state.credits) setCredit(c.key, null);
      go(`/order/${r.id}`);
    } catch (err) {
      if (err.data?.errors?.credit) {
        btn.disabled = false; sum();
        return toast(esc(err.data.errors.credit), { icon: "x", ms: 6000 });
      }
      if (err.data?.errors?.code) {
        (await import("./core.js")).setCoupon(null);
        btn.disabled = false; sum();
        return toast(`${esc(err.data.errors.code)} We've removed the code. Please check your new total.`, { icon: "x", ms: 6000 });
      }
      if (err.data?.errors?.payment) {
        btn.disabled = false; sum();
        return toast(esc(err.data.errors.payment), { icon: "x", ms: 6000 });
      }
      for (const [k, m] of Object.entries(err.data?.errors || {})) { const fd = $(`[data-k="${k}"]`, f); if (fd) { fd.classList.add("err"); $(".msg", fd).textContent = m; } }
      $(".field.err input, .field.err textarea", f)?.focus();
      toast(esc(err.message), { icon: "x" });
      btn.disabled = false; sum();
    }
  };
}

function success(main, { params }) {
  const o = (() => { try { return JSON.parse(sessionStorage.getItem("az_last")); } catch { return null; } })();
  const s = state.store;
  const mine = o && o.id === params[0];
  const details = mine && s.payments?.[o.payment]?.details;
  const pay = mine && o.payment !== "cod" ? `<div class="card-box pay-box" style="max-width:560px;text-align:left"><b class="serif" style="font-size:1.4rem">Next: complete your payment of ${rs(o.total)}</b>${details ? `<pre class="pay-details">${esc(details)}</pre><button class="btn ghost sm" data-copy="${esc(details)}">${icon("copy", "", 14)} Copy details</button>` : ""}<p style="margin:10px 0 0;color:var(--ink-2)">Send a screenshot of the transfer on WhatsApp with your order number <b>${esc(o.id)}</b>. Your order ships as soon as we confirm the payment.</p></div>` : "";
  main.innerHTML = `<section class="wrap success"><div class="seal"><span>${icon("check", "", 44)}</span></div><span class="eyebrow">Shukriya${mine ? `, ${esc(o.customer.name.split(" ")[0])}` : ""}!</span><h1>Your aarzu is <em class="grad-text">on its way</em></h1>
    <span class="oid">${esc(params[0])}</span><p style="max-width:520px;color:var(--ink-2);margin:0">We've received your order${mine ? ` of <b>${rs(o.total)}</b>` : ""}. Our team will confirm it on WhatsApp shortly. Keep your order number to track it anytime.</p>
    ${pay}
    <div data-slot="success-extras" data-order="${esc(params[0])}" style="width:min(720px,100%)"></div>
    <div class="timeline">${["Placed", "Confirmed", "Dispatched", "Delivered"].map((t, i) => `<div class="${i ? "" : "done"}"><b>${i ? i + 1 : icon("check", "", 16)}</b>${t}</div>`).join("")}</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:20px"><a class="btn wa" href="https://wa.me/${s.contact.whatsapp}?text=${encodeURIComponent(`Assalam o Alaikum! My Aarzu order number is ${params[0]}.`)}" target="_blank" rel="noopener">${icon("whatsapp", "", 18)} Confirm on WhatsApp</a><a class="btn ghost" href="/track?id=${esc(params[0])}" data-link>Track order</a><a class="btn rani" href="/shop" data-link>Keep shopping</a></div></section>`;
  main.addEventListener("click", (e) => { const c = e.target.closest("[data-copy]"); if (c) navigator.clipboard?.writeText(c.dataset.copy).then(() => toast("Payment details copied")); });
  setTimeout(() => confetti(220), 300);
}

// ================================================================== OTHER PAGES
function wishlist(main) {
  const list = state.wish.map((id) => state.byId[id]).filter(Boolean);
  main.innerHTML = `<section class="phero"><h1>Your Wishlist</h1><div class="urdu">پسندیدہ</div></section><section class="wrap" style="padding-top:40px">${list.length ? `<div class="grid" style="--cols:4">${list.map((p, i) => card(p, { i })).join("")}</div>` : `<div class="empty-state"><div class="ur">دل</div><h3>Nothing saved yet</h3><p>Tap the heart on anything you love and it'll wait for you here.</p><a class="btn rani" href="/shop" data-link>Explore</a></div>`}</section>`;
}

function western(main) {
  main.innerHTML = `<section class="west sec" style="min-height:80vh;display:grid;align-items:center"><div class="blob a"></div><div class="blob b"></div><div class="blob c"></div><div class="wrap">
    <div><span class="eyebrow" style="color:#B9B3FF">Aarzu West</span><h2 class="split">${splitWords("Western")}<span class="soon">Coming soon</span></h2><p>Co-ords, denim, dresses, shirts and outerwear, cut for Pakistani weather and made with the same love for colour. Be the first to know when we launch.</p>
      <form class="waitlist" data-wl="western"><input name="contact" placeholder="Email or WhatsApp number" aria-label="Email or WhatsApp"><button class="btn rani sm">Join the list</button></form><p class="wl-msg" style="margin-top:12px;font-size:.88rem"></p>
      <div style="display:flex;gap:20px;margin-top:30px;color:rgba(255,255,255,.7);font-size:.86rem;flex-wrap:wrap"><span>${icon("sparkles", "", 16)} Early access</span><span>${icon("badge-percent", "", 16)} Launch-day prices</span><span>${icon("bell", "", 16)} WhatsApp alert</span></div></div>
    <div class="west-cards">${["Co-ords", "Denim", "Dresses", "Shirts", "Outerwear", "Basics"].map((t, i) => { const m = media("western")[i % Math.max(1, media("western").length)]; return `<div class="west-card" data-reveal style="--i:${i}">${m ? `<img src="${esc(img(m))}" alt="" referrerpolicy="no-referrer">` : `<div class="sil"></div>`}<span class="lock">${icon("lock", "", 14)}</span><b>${t}</b></div>`; }).join("")}</div></div></section>`;
  waitlists(main);
}

function about(main) {
  const n = P().length, orig = P().filter((p) => p.collection === "originals").length;
  main.innerHTML = `<section class="phero" style="--bg:linear-gradient(135deg,#1E1324,#3a1530);color:#fff"><span class="eyebrow" style="color:var(--saffron)">Our story</span><h1 style="color:#fff;margin-top:12px">Every thread, an <em class="grad-text">aarzu</em></h1><div class="urdu">آرزو کا مطلب ہے خواہش</div><p style="color:rgba(255,255,255,.75)">Aarzu means “wish” in Urdu. We started with a simple one: that dressing beautifully in Pakistan shouldn't cost the earth.</p></section>
  <section class="sec wrap"><div class="split-sec"><p class="big-quote" data-reveal="left">We bring you the season's most-loved designer suits for <em>less</em>, alongside our own Originals, each inspired by a craft from <em>somewhere in Pakistan</em>.</p>
    <div data-reveal="right" style="color:var(--ink-2);font-size:1.05rem"><p>From the ajrak of Sindh to the phulkari of Punjab, the Swati cross-stitch of the north to the mirror work of Thar, Pakistan wears its history in colour. Aarzu Originals carry those stories into everyday shalwar kameez.</p><p>Every piece is checked by our team before it leaves us. Cash on delivery is standard, exchanges are easy, and a real person answers on WhatsApp.</p></div></div></section>
  <section class="wrap"><div class="stat-row">${[[n, "Styles live"], [orig, "Aarzu Originals"], [5, "Provinces of inspiration"], [state.store.returnDays, "Day exchanges"]].map(([v, l], i) => `<div class="stat" data-reveal style="--i:${i}"><b data-count="${v}">0</b><span>${l}</span></div>`).join("")}</div></section>
  <section class="sec wrap"><div class="values">${[["hand-heart", "Made with meaning", "Every Original begins with a craft and the people who keep it alive.", "#D6246E"], ["badge-percent", "Fair prices", "Designer quality without designer mark-ups. Every Designer Edit piece is Rs 1,000 under retail.", "#F2A900"], ["shield-check", "Checked by hand", "We inspect stitching, colour and fabric before anything ships.", "#0B5D4B"]].map(([ic, t, d, c], i) => `<div class="value" data-reveal style="--i:${i}"><span class="ic" style="--c:${c}">${icon(ic, "", 24)}</span><h4>${t}</h4><p>${d}</p></div>`).join("")}</div></section>`;
}

function faq(main) {
  const s = state.store;
  const qa = [["Do you offer cash on delivery?", "Yes, cash on delivery is available everywhere in Pakistan. You can also pay by bank transfer, JazzCash or Easypaisa."], ["How long does delivery take?", `Most cities receive orders in 2–4 working days, Lahore in 1–2. Orders placed before ${s.dispatchCutoffHour > 12 ? s.dispatchCutoffHour - 12 : s.dispatchCutoffHour}pm (Mon–Sat) are dispatched the same day.`], ["How much is delivery?", `Delivery is free on orders over ${rs(s.freeShippingThreshold)}. Otherwise it's a flat ${rs(s.shippingFee)}.`], ["Can I exchange my order?", `Yes. Unworn items with tags can be exchanged within ${s.returnDays} days for a different size or design. Message us on WhatsApp to start.`], ["What's the difference between unstitched and ready to wear?", "Unstitched suits come as fabric (shirt, trouser, often a dupatta) for your tailor. Ready to wear pieces are stitched in standard sizes. See the size guide."], ["What are Aarzu Originals?", "Our own designs, each inspired by a craft from a region of Pakistan: ajrak, phulkari, truck art, Multani tiles, Balochi embroidery and more."], ["What is the Designer Edit?", "Hand-picked designer suits from the season, each priced Rs 1,000 below its retail price and checked by our team."], ["How do discount codes work?", "One code per order. Multi-buy and Complete-the-Look discounts apply automatically on top."]];
  main.innerHTML = `<section class="phero"><h1>Questions? <em style="color:var(--rani)">Jawab</em> here.</h1><div class="urdu">عام سوالات</div></section><section class="sec wrap"><div class="prose">${qa.map(([q, a], i) => `<details class="acc" ${i ? "" : "open"} data-reveal style="--i:${i}"><summary>${q} ${icon("plus", "", 16)}</summary><div class="body">${a}</div></details>`).join("")}</div></section>`;
}

function sizeGuide(main) {
  main.innerHTML = `<section class="phero"><h1>Size guide</h1><div class="urdu">ناپ</div><p>Measure over light clothing. Questions? We're happy to help on WhatsApp.</p></section><section class="sec wrap"><div class="prose">${sizeTables()}</div></section>`;
}

function shipping(main) {
  const s = state.store;
  main.innerHTML = `<section class="phero"><h1>Delivery & exchanges</h1><div class="urdu">ترسیل اور تبادلہ</div></section><section class="sec wrap"><div class="prose">
    <h2>Delivery</h2><p>We deliver to every city in Pakistan through trusted courier partners. Delivery is <b>free over ${rs(s.freeShippingThreshold)}</b>, otherwise ${rs(s.shippingFee)}.</p>
    <table class="table"><tr><th>City</th><th>Estimated delivery (working days)</th></tr>${s.cities.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.days)}</td></tr>`).join("")}</table>
    <h2>Exchanges</h2><p>Changed your mind about a size or colour? Exchange unworn items with tags within <b>${s.returnDays} days</b> of delivery. Message us on WhatsApp with your order number and we'll arrange it.</p>
    <h3>Not eligible</h3><p>Items that have been stitched, altered, washed or worn, and items bought on final clearance.</p></div></section>`;
}

function contact(main) {
  const c = state.store.contact;
  main.innerHTML = `<section class="phero"><h1>Get in touch</h1><div class="urdu">رابطہ کریں</div><p>We usually reply within an hour during working hours.</p></section>
  <section class="sec wrap"><div class="contact-grid"><div class="contact-card" data-reveal="left"><h3 style="font-size:2rem">Aarzu Studio</h3>
    <div class="row">${icon("whatsapp")}<span><b>WhatsApp</b><br><a href="https://wa.me/${c.whatsapp}" target="_blank" rel="noopener">+${c.whatsapp}</a></span></div><div class="row">${icon("phone")}<span><b>Phone</b><br>${esc(c.phone)}</span></div><div class="row">${icon("mail")}<span><b>Email</b><br>${esc(c.email)}</span></div><div class="row">${icon("map-pin")}<span><b>Studio</b><br>${esc(c.address)}</span></div><div class="row">${icon("clock")}<span><b>Hours</b><br>${esc(c.hours)}</span></div></div>
    <form class="card-box" id="cf" data-reveal="right" style="display:grid;gap:14px"><h3 style="font-size:2rem">Send a message</h3><div class="row2"><div class="field"><label>Name</label><input name="name" required></div><div class="field"><label>Email</label><input name="email" type="email" required></div></div><div class="field"><label>Message</label><textarea name="message" required></textarea></div><button class="btn rani">Send message</button></form></div></section>`;
  $("#cf", main).onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { await api("/api/contact", { name: f.name.value, email: f.email.value, message: f.message.value }); f.reset(); toast("Shukriya! We'll reply soon."); } catch (err) { toast(esc(err.message)); } };
}

function track(main, { url }) {
  main.innerHTML = `<section class="phero"><h1>Track your order</h1><div class="urdu">آرڈر کی صورتحال</div></section><section class="sec wrap" style="max-width:720px">
    <form id="tf" class="card-box" style="display:grid;gap:14px"><div class="row2"><div class="field"><label>Order number</label><input name="id" value="${esc(url.searchParams.get("id") || "")}" placeholder="AZ…" required></div><div class="field"><label>Mobile number</label><input name="phone" placeholder="03XX XXXXXXX" required></div></div><button class="btn rani">Track</button></form><div id="tr" style="margin-top:30px"></div></section>`;
  $("#tf", main).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const o = await api(`/api/orders/${encodeURIComponent(f.id.value.trim().toUpperCase())}?phone=${encodeURIComponent(f.phone.value)}`);
      const steps = ["placed", "confirmed", "dispatched", "delivered"], at = steps.indexOf(o.status);
      $("#tr", main).innerHTML = `<div class="card-box swap-in"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px"><b class="serif" style="font-size:1.6rem">Order ${esc(o.id)}</b><span class="status ${o.status}">${o.status}</span></div><p style="color:var(--muted)">${new Date(o.createdAt).toLocaleString("en-GB")} · ${esc(o.customer.city)} · ${rs(o.total)}</p>
        ${o.status === "cancelled" || o.status === "returned" ? `<p class="nudge">${icon("x")}<span>This order was ${o.status === "returned" ? "returned to us" : "cancelled"}. Questions? WhatsApp us on +${esc(state.store.contact.whatsapp)}.</span></p>` : `<div class="timeline">${steps.map((t, i) => `<div class="${i <= at ? "done" : ""}"><b>${i <= at ? icon("check", "", 16) : i + 1}</b>${t[0].toUpperCase() + t.slice(1)}</div>`).join("")}</div>`}
        ${o.tracking ? `<div class="ship-box">${icon("truck")}<div><small>Shipped with ${esc(o.courier || "our courier")}</small><b>${esc(o.tracking)}</b></div><button class="btn ghost sm" data-copy="${esc(o.tracking)}">${icon("copy", "", 14)} Copy</button>${o.trackUrl ? `<a class="btn rani sm" href="${esc(o.trackUrl)}" target="_blank" rel="noopener">Track on ${esc(o.courier)}</a>` : ""}</div>` : ""}
        <div style="margin-top:24px">${o.items.map((i) => `<div class="sum-item" style="margin-bottom:10px"><div class="ph"><img src="${esc(img(i.image))}" alt="" referrerpolicy="no-referrer"><span class="q">${i.qty}</span></div><div><b>${esc(i.title)}</b><span style="color:var(--muted)">${esc(i.size)}</span></div><span>${rs(i.line)}</span></div>`).join("")}</div></div>`;
    } catch (err) { $("#tr", main).innerHTML = `<p style="color:#D0313F">${esc(err.message)}</p>`; }
  };
  main.addEventListener("click", (e) => { const c = e.target.closest("[data-copy]"); if (c) navigator.clipboard?.writeText(c.dataset.copy).then(() => toast("Tracking number copied")); });
}

function admin(main) {
  let pw = sessionStorage.getItem("az_admin") || "";
  const call = (path, body, method) => fetch(path, { method: method || (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${pw}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; });
  const login = () => {
    main.innerHTML = `<section class="wrap admin" style="max-width:440px"><form id="lf" class="card-box" style="display:grid;gap:14px;margin-top:60px"><h2>Aarzu Admin</h2><div class="field"><label>Password</label><input type="password" name="pw" autofocus></div><button class="btn rani">Sign in</button></form></section>`;
    $("#lf", main).onsubmit = async (e) => { e.preventDefault(); pw = e.target.pw.value; try { await call("/api/admin/summary"); sessionStorage.setItem("az_admin", pw); dash(); } catch { toast("Wrong password"); } };
  };
  const dash = async (tab = "orders") => {
    const s = await call("/api/admin/summary");
    const extTab = ext.adminTabs.find((t) => t.key === tab);
    const body = extTab ? null : tab === "orders" ? await call("/api/admin/orders") : tab === "stock" ? null : await call(`/api/admin/${tab}`);
    main.innerHTML = `<section class="wrap admin"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:20px"><h1 style="font-size:2.6rem">Dashboard</h1><button class="btn ghost sm" id="out">Sign out</button></div>
      <div class="kpis">${[["Revenue", rs(s.revenue)], ["Orders", s.orders], ["To process", s.pending], ["Waitlist (West)", s.waitlist], ["Subscribers", s.newsletter]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="tabs">${["orders", "stock", "waitlist", "newsletter", "leads", "messages"].map((t) => `<button data-tab="${t}" class="${t === tab ? "on" : ""}">${t}</button>`).join("")}${ext.adminTabs.map((t) => `<button data-tab="${esc(t.key)}" class="${t.key === tab ? "on" : ""}">${esc(t.label)}</button>`).join("")}</div>
      ${extTab ? `<div id="ext-tab"></div>` : ""}
      ${extTab ? "" : tab === "orders" ? adminOrders(body)
      : tab === "stock" ? `<table><tr><th>Product</th><th>Stock by size</th></tr>${P().map((p) => `<tr><td><b>${esc(p.title)}</b><br><small>${esc(p.id)} · ${rs(p.price)}</small></td><td>${Object.entries(p.stock).map(([z, n]) => `<label style="margin-right:10px;white-space:nowrap">${esc(z)} <input type="number" min="0" value="${n}" style="width:64px" data-stock="${p.id}|${esc(z)}"></label>`).join("")}</td></tr>`).join("")}</table>`
      : `<table><tr><th>Contact / name</th><th>Details</th><th>Date</th></tr>${body.map((r) => `<tr><td>${esc(r.contact || r.name || "")}${r.email ? `<br><small>${esc(r.email)}</small>` : ""}</td><td>${esc(r.message || r.prize || r.interest || "")}</td><td>${new Date(r.at).toLocaleString("en-GB")}</td></tr>`).join("") || `<tr><td colspan="3">Nothing yet.</td></tr>`}</table>`}</section>`;
    if (extTab) try { await extTab.render($("#ext-tab", main), call); } catch (e) { $("#ext-tab", main).textContent = e.message; }
    main.onclick = async (e) => {
      const ship = e.target.closest("[data-ship]");
      if (ship) {
        const row = ship.closest("[data-order]");
        await call(`/api/admin/orders/${ship.dataset.ship}`, { courier: $("[data-courier]", row).value, tracking: $("[data-tracking]", row).value }, "PATCH");
        toast("Courier & tracking saved");
        return dash("orders");
      }
      const t = e.target.closest("[data-tab]"); if (t) dash(t.dataset.tab); if (e.target.closest("#out")) { sessionStorage.removeItem("az_admin"); login(); } };
    main.onchange = async (e) => {
      const st = e.target.closest("[data-st]");
      if (st) { await call(`/api/admin/orders/${st.dataset.st}`, { status: st.value }, "PATCH"); toast(`Order ${esc(st.dataset.st)} → ${st.value}`); dash("orders"); }
      const sk = e.target.closest("[data-stock]");
      if (sk) { const [id, size] = sk.dataset.stock.split("|"); await call("/api/admin/stock", { id, size, qty: Number(sk.value) }); state.byId[id].stock[size] = Number(sk.value); toast("Stock updated"); }
    };
  };
  pw ? dash().catch(login) : login();
}

// Admin orders: risk flags from the phone's order history, one-tap WhatsApp
// messages (confirm / dispatched), courier + tracking number, and statuses.
function adminOrders(orders) {
  if (!orders.length) return `<div class="empty-state"><h3>No orders yet</h3><p>New orders appear here instantly.</p></div>`;
  const s = state.store;
  const byPhone = {};
  for (const o of orders) (byPhone[o.customer.phone] ||= []).push(o);
  const wa = (o, text) => `https://wa.me/${o.customer.phone}?text=${encodeURIComponent(text)}`;
  const first = (o) => o.customer.name.split(" ")[0];
  return `<div class="ao-list">${orders.map((o) => {
    const others = byPhone[o.customer.phone].filter((x) => x.id !== o.id);
    const refused = others.filter((x) => x.status === "returned").length;
    const delivered = others.filter((x) => x.status === "delivered").length;
    const risk = refused ? `<span class="status cancelled">⚠ Refused ${refused} before</span>` : delivered ? `<span class="status delivered">★ ${delivered} delivered before</span>` : others.length ? `<span class="status confirmed">${others.length} earlier order${others.length > 1 ? "s" : ""}</span>` : `<span class="status">First order</span>`;
    const confirmMsg = `Assalam o Alaikum ${first(o)}! This is ${s.name}. Please reply YES to confirm your order ${o.id} of ${rs(o.total)}${o.payment === "cod" ? " (cash on delivery)" : ""}, delivering to ${o.customer.address}, ${o.customer.city}. Shukriya!`;
    const shipMsg = `Good news ${first(o)}! Your ${s.name} order ${o.id} has been dispatched${o.courier ? ` with ${o.courier}` : ""}${o.tracking ? `, tracking number ${o.tracking}` : ""}.${o.payment === "cod" ? ` Please keep ${rs(o.total)} ready for the rider.` : ""} Track: ${location.origin}/track?id=${o.id}`;
    return `<article class="ao" data-order="${esc(o.id)}">
      <header><b>${esc(o.id)}</b><small>${new Date(o.createdAt).toLocaleString("en-GB")}</small><span class="status ${o.status}">${o.status}</span>${risk}<span class="ao-total">${rs(o.total)} · ${esc(o.payment)}${o.coupon ? ` · ${esc(o.coupon)}` : ""}</span></header>
      <div class="ao-body">
        <div><b>${esc(o.customer.name)}</b><br><a href="tel:+${esc(o.customer.phone)}">+${esc(o.customer.phone)}</a>${o.customer.email ? ` · ${esc(o.customer.email)}` : ""}<br><small>${esc(o.customer.address)}, ${esc(o.customer.city)}</small>${o.customer.notes ? `<br><small><i>${esc(o.customer.notes)}</i></small>` : ""}</div>
        <div>${o.items.map((i) => `${esc(i.title)} (${esc(i.size)}) ×${i.qty}${lineExtras(i)}`).join("<br>")}${(o.credits || []).map((c) => `<br><small>${esc(c.label)} −${rs(c.amount)}</small>`).join("")}</div>
        <div class="ao-actions">
          <a class="btn wa sm" href="${esc(wa(o, confirmMsg))}" target="_blank" rel="noopener">${icon("whatsapp", "", 14)} Confirm</a>
          <a class="btn ghost sm" href="${esc(wa(o, shipMsg))}" target="_blank" rel="noopener">${icon("truck", "", 14)} Dispatch msg</a>
          <a class="btn ghost sm" href="/admin/invoice/${esc(o.id)}" target="_blank" rel="opener">${icon("list", "", 14)} Invoice</a>
          <select data-st="${esc(o.id)}" aria-label="Status">${["placed", "confirmed", "dispatched", "delivered", "cancelled", "returned"].map((x) => `<option ${x === o.status ? "selected" : ""}>${x}</option>`).join("")}</select>
          <span class="ao-ship"><select data-courier aria-label="Courier"><option value="">Courier…</option>${(s.couriers || []).map((c) => `<option ${c.name === o.courier ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><input data-tracking placeholder="Tracking no." value="${esc(o.tracking || "")}"><button class="btn sm" data-ship="${esc(o.id)}">Save</button></span>
        </div>
      </div></article>`;
  }).join("")}</div>`;
}

function notFound(main) {
  main.innerHTML = `<section class="wrap empty-state" style="min-height:60vh"><div class="ur">گمشدہ</div><h3>This page wandered off</h3><p>Let's get you back to something beautiful.</p><a class="btn rani" href="/" data-link>Go home</a></section>`;
}

export const routes = [
  [/^\/$/, home], [/^\/shop\/?$/, shop], [/^\/product\/([\w-]+)\/?$/, product], [/^\/checkout\/?$/, checkout], [/^\/order\/([A-Z0-9]+)\/?$/, success],
  [/^\/wishlist\/?$/, wishlist], [/^\/western\/?$/, western], [/^\/about\/?$/, about], [/^\/faq\/?$/, faq], [/^\/size-guide\/?$/, sizeGuide],
  [/^\/shipping\/?$/, shipping], [/^\/contact\/?$/, contact], [/^\/track\/?$/, track], [/^\/admin\/?$/, admin], [/.*/, notFound],
];
void skeletons; void toggleWish;
