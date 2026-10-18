// Aarzu gift cards · تحفہ کارڈ — digital cards (Rs 2,000 to Rs 25,000) sent to the recipient on
// WhatsApp or email once the buyer's payment is confirmed. Server side: lib/routes/giftcards.mjs.
//   /gift-cards           choose an amount, personalise with a live 3D card (message on the back),
//                         how it works, balance check, FAQ. /product/gift-card-<value> lands here too.
//   home-end              Eidi promo band
//   checkout-extras       how gift cards are delivered, when the bag holds any
//   checkout-credits      apply / remove a code -> setCredit("giftcard", { label, amount, payload: { code } })
//   success-extras        what happens next for the gift cards just bought
//   admin "Gift cards"    every code with balance, status and recipient, plus one-tap WhatsApp / email
import { $, $$, esc, rs, img, icon, api, state, quote, toast, addToCart, flyToCart, setCredit, listed, registerRoute, registerSlot, registerLink, registerAdminTab } from "../core.js";

const KEY = "giftcard";
const MAX_MSG = 200;
const THEMES = ["rani", "emerald", "indigo", "aubergine"]; // matches the four card designs, lowest value first
const giftCards = () => state.products.filter((p) => p.category === "giftcard").sort((a, b) => a.price - b.price);
const themeOf = (p) => THEMES[Math.max(0, giftCards().indexOf(p)) % THEMES.length];
const isGiftLine = (i) => state.byId[i.id]?.category === "giftcard" || /^AZ-GC/.test(i.id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Slots are shared with other features: append our own box, never replace the slot's content.
const mount = (el, html) => { el.insertAdjacentHTML("beforeend", html); return el.lastElementChild; };
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const savedCustomer = () => { try { return JSON.parse(localStorage.getItem("az_cust")) || {}; } catch { return {}; } };

// Recipient contact: a Pakistani mobile (for WhatsApp) or an email address
const phoneOf = (v) => { const d = String(v || "").replace(/\D/g, ""); return /^03\d{9}$/.test(d) ? "92" + d.slice(1) : /^923\d{9}$/.test(d) ? d : null; };
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
const via = (v) => (phoneOf(v) ? "WhatsApp" : emailOk(v) ? "email" : null);
const names = (list) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

// "azgc 7k3m p9qa" / "7K3MP9QA" -> "AZGC-7K3M-P9QA"; null if it isn't shaped like a code
const prettyCode = (v) => {
  let s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length === 12 && s.startsWith("AZGC")) s = s.slice(4);
  return s.length === 8 ? `AZGC-${s.slice(0, 4)}-${s.slice(4)}` : null;
};
const STATUS = {
  active: ["Ready to spend", "emerald"],
  pending: ["Not active yet", "saffron"],
  redeemed: ["Fully used", "muted"],
  void: ["Cancelled", "crimson"],
  expired: ["Expired", "muted"],
};
const WHY = {
  pending: "This gift card isn't active yet. It switches on as soon as the order it came from is confirmed.",
  redeemed: "This gift card has been fully used.",
  void: "This gift card has been cancelled.",
  expired: "This gift card has expired.",
};
const lookup = (code) => api(`/api/giftcards/${encodeURIComponent(code)}`);

// What a card covers, from the live catalogue (never a made-up claim)
function covers(value) {
  const all = listed().filter((p) => p.category !== "giftcard");
  const n = all.filter((p) => p.price <= value).length;
  if (!all.length) return "Spend it on anything at Aarzu";
  if (n === all.length) return "Covers any piece in the shop";
  if (!n) return "Put it towards any piece";
  return `${n} of ${all.length} pieces fully covered`;
}

const IDEAS = [
  ["Eidi", "Eid Mubarak! Here's your Eidi. Choose something beautiful for yourself."],
  ["Shaadi", "Shaadi mubarak! Something lovely for all the celebrations ahead."],
  ["Birthday", "Happy birthday! Treat yourself to something you'll love wearing."],
  ["Thank you", "Thank you for everything. This one is just for you."],
  ["Just because", "No reason at all, just because you deserve something special."],
];

const FAQ = () => [
  ["When does the recipient get their code?", "As soon as your payment is confirmed, we send the code with your message to the WhatsApp number or email you gave us."],
  ["How long is a gift card valid?", "12 months from the day it is sent. Whatever isn't spent stays on the card until then."],
  ["What can it be used on?", "Everything at Aarzu: unstitched and ready-to-wear suits, dupattas and shawls, stitching and delivery. They simply enter the code at checkout."],
  ["Can it be used over several orders?", "Yes. Spend part of it now and the rest later; the balance is saved on the card. Anyone can check what's left on this page."],
  ["Do discount codes work with gift cards?", "Gift cards are sold at face value, so discount codes and offers don't apply when buying one. When spending a gift card, a discount code can still be used on the same order."],
  ["What if an order is cancelled?", "Gift cards bought in a cancelled order are cancelled too. If a gift card paid for an order that is cancelled, the amount goes back onto the card."],
  ["The code got lost. What now?", `Message us on WhatsApp with the order number and we'll send it again.`],
];

// ================================================================== /gift-cards
function page(view, { url, params }) {
  const list = giftCards();
  if (!list.length) {
    view.innerHTML = `<section class="wrap empty-state"><div class="ur">تحفہ</div><h3>Gift cards are coming soon</h3><p>We're putting the finishing touches on Aarzu gift cards. In the meantime, there's plenty to love in the shop.</p><a class="btn rani" href="/shop" data-link>Shop now</a></section>`;
    return;
  }
  const want = Number(params?.[0] || url.searchParams.get("amount"));
  let sel = list.find((p) => p.price === want) || list[Math.min(1, list.length - 1)];
  const sold = list.reduce((s, p) => s + (p.sold || 0), 0);
  const me = savedCustomer().name || "";
  const wa = state.store.contact?.whatsapp;
  const faq = FAQ();
  list.forEach((p) => { new Image().src = img(p.images[0]); }); // no flicker when switching amounts

  view.innerHTML = `
  <section class="gc-hero">
    <div class="wrap gc-hero-in">
      <div class="gc-hero-copy">
        <span class="eyebrow fade-up" style="--delay:.05s">Aarzu gift cards</span>
        <h1 class="fade-up" style="--delay:.15s">Give the gift of <em>aarzu</em></h1>
        <div class="urdu fade-up" style="--delay:.3s">تحفہ کارڈ · دل سے</div>
        <p class="fade-up" style="--delay:.4s">Digital gift cards from ${rs(list[0].price)} to ${rs(list.at(-1).price)}, sent on WhatsApp or email with your own message. The perfect Eidi for everyone who loves choosing for themselves.</p>
        <div class="gc-hero-ctas fade-up" style="--delay:.5s"><button class="btn gold" data-gc-go="gc-build">${icon("gift", "", 16)} Choose an amount</button><button class="btn ghost-light" data-gc-go="gc-balance">Check a balance</button></div>
        <div class="gc-hero-trust fade-up" style="--delay:.6s"><span>${icon("whatsapp", "", 17)} Sent on WhatsApp or email</span><span>${icon("clock", "", 17)} Valid 12 months</span><span>${icon("shopping-bag", "", 17)} Use on everything</span></div>
        ${sold >= 5 ? `<p class="gc-hero-sold fade-up" style="--delay:.7s">${icon("hand-heart", "", 16)} <b>${sold}</b> Aarzu gift cards given so far</p>` : ""}
      </div>
      <div class="gc-fan" aria-hidden="true">${list.map((p, k) => `<img src="${esc(img(p.images[0]))}" alt="" style="--k:${k};--n:${list.length}" width="864" height="540">`).join("")}</div>
    </div>
  </section>

  <section class="sec wrap gc-anchor" id="gc-build">
    <div class="sec-head" data-reveal><span class="eyebrow">Make it personal</span><h2>Choose, write, <em>gift</em></h2><div class="urdu">اپنے دل کی بات لکھیں</div></div>
    <div class="gc-grid">
      <div class="gc-stage-col" data-reveal="left">
        <div class="gc-stage" id="gc-stage">
          <div class="gc-tilt" id="gc-tilt"><div class="gc-deal" id="gc-deal"><div class="gc-flip" id="gc-flip">
            <div class="gc-face gc-front">
              <img id="gc-front-img" src="${esc(img(sel.images[0]))}" alt="${esc(sel.title)}" width="864" height="540">
              <span class="gc-for" id="gc-for">For <b id="gc-pv-to"></b></span>
              <span class="gc-glare"></span>
            </div>
            <div class="gc-face gc-back t-${themeOf(sel)}" id="gc-back" aria-hidden="true">
              <div class="gc-stripe"><span class="ur">آرزو</span></div>
              <div class="gc-note">
                <b class="gc-dear" id="gc-pv-dear"></b>
                <p class="gc-msg" id="gc-pv-msg"></p>
                <span class="gc-sign">With love, <b id="gc-pv-from"></b></span>
              </div>
              <div class="gc-back-foot"><span class="gc-code">AZGC-••••-••••</span><b class="gc-val" id="gc-pv-amt">${rs(sel.price)}</b></div>
            </div>
          </div></div></div>
        </div>
        <div class="gc-stage-ctl"><button type="button" class="btn ghost sm" id="gc-turn" aria-pressed="false">${icon("refresh-ccw", "", 15)} Flip the card</button><small>Your message is printed on the back.</small></div>
      </div>

      <form class="gc-form" id="gc-form" novalidate data-reveal="right">
        <div class="co-sec"><h3><span class="n">1</span>Choose an amount</h3>
          <div class="gc-amounts" role="radiogroup" aria-label="Gift card amount">${list.map((p) => `<label class="gc-amt ${p.id === sel.id ? "on" : ""}" data-id="${esc(p.id)}">
            <input type="radio" name="amount" value="${esc(p.id)}" ${p.id === sel.id ? "checked" : ""}>
            <img src="${esc(img(p.images[0]))}" alt="" width="864" height="540" loading="lazy">
            <span><b>${rs(p.price)}</b><small>${esc(covers(p.price))}</small></span>
            <i class="tick">${icon("check", "", 15)}</i></label>`).join("")}</div>
        </div>
        <div class="co-sec"><h3><span class="n">2</span>Who is it for?</h3>
          <div class="row2">
            <div class="field" data-k="to"><label for="gc-to">Their name</label><input id="gc-to" name="to" maxlength="60" autocomplete="off" placeholder="e.g. Ayesha"><span class="msg"></span></div>
            <div class="field" data-k="toContact"><label for="gc-contact">Their WhatsApp or email</label><input id="gc-contact" name="toContact" maxlength="120" autocomplete="off" inputmode="email" placeholder="03XX XXXXXXX or email"><span class="msg"></span><span class="hint gc-via" id="gc-via"></span></div>
          </div>
        </div>
        <div class="co-sec" style="border:0;margin-bottom:0"><h3><span class="n">3</span>Add your message</h3>
          <div class="field" data-k="from"><label for="gc-from">From</label><input id="gc-from" name="from" maxlength="60" autocomplete="name" placeholder="Your name" value="${esc(me)}"><span class="msg"></span></div>
          <div class="field" data-k="message"><label for="gc-msg">Personal message <span class="gc-count" id="gc-count">0 / ${MAX_MSG}</span></label><textarea id="gc-msg" name="message" maxlength="${MAX_MSG}" rows="3" placeholder="Write something from the heart…"></textarea><span class="msg"></span></div>
          <div class="gc-ideas"><span>Need words?</span>${IDEAS.map(([l, t]) => `<button type="button" class="chip" data-idea="${esc(t)}">${esc(l)}</button>`).join("")}</div>
          <button type="button" class="gc-peek" id="gc-peek">${icon("eye", "", 15)} See it on the card</button>
          <button class="btn rani block gc-add" id="gc-add">${icon("gift", "", 17)} <span id="gc-add-label">Add to bag · ${rs(sel.price)}</span></button>
          <ul class="gc-promise">
            <li>${icon("whatsapp", "", 16)} We send the code to them as soon as your payment is confirmed</li>
            <li>${icon("clock", "", 16)} Valid for 12 months from the day it's sent</li>
            <li>${icon("shopping-bag", "", 16)} Use it on everything, across as many orders as they like</li>
          </ul>
        </div>
      </form>
    </div>
  </section>

  <section class="sec wrap" style="padding-top:0">
    <div class="sec-head" data-reveal><span class="eyebrow">How it works</span><h2>Three steps to the perfect <em>Eidi</em></h2><div class="urdu">آسان اور خوبصورت</div></div>
    <div class="values gc-how">${[
      ["gift", "Choose & personalise", "Pick an amount, add their name and a message from the heart.", "var(--rani)"],
      ["lock", "Check out as usual", "Pay the way you like. As soon as your payment is confirmed, the card switches on.", "var(--saffron)"],
      ["whatsapp", "They shop Aarzu", "The code arrives on WhatsApp or email. They enter it at checkout, on anything, for 12 months.", "var(--emerald)"],
    ].map(([ic, t, d, c], i) => `<div class="value" data-reveal style="--i:${i}"><span class="ic" style="--c:${c}">${icon(ic, "", 24)}</span><span class="gc-step-n">0${i + 1}</span><h4>${t}</h4><p>${d}</p></div>`).join("")}</div>
  </section>

  <section class="wrap gc-anchor" id="gc-balance">
    <div class="gc-bal" data-reveal="zoom">
      <div class="gc-bal-copy"><span class="eyebrow" style="color:var(--saffron)">Already have one?</span><h2>Check your <em>balance</em></h2>
        <p>Enter the code from your gift card message to see what's left to spend and when it expires.</p>
        <form class="gc-bal-form" id="gc-bal-f"><input name="code" placeholder="AZGC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" aria-label="Gift card code"><button class="btn gold sm">Check</button></form></div>
      <div class="gc-bal-out" id="gc-bal-out" aria-live="polite"><div class="gc-bal-empty"><span class="ur">بیلنس</span><small>Your balance will appear here</small></div></div>
    </div>
  </section>

  <section class="sec wrap">
    <div class="sec-head" data-reveal><span class="eyebrow">Good to know</span><h2>Gift card <em>questions</em></h2><div class="urdu">عام سوالات</div></div>
    <div class="prose">${faq.map(([q, a], i) => `<details class="acc" data-reveal style="--i:${i}" ${i ? "" : "open"}><summary>${q} ${icon("plus", "", 16)}</summary><div class="body">${a}${i === faq.length - 1 && wa ? ` <a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">Open WhatsApp</a>` : ""}</div></details>`).join("")}</div>
  </section>`;

  const f = $("#gc-form", view);
  const flip = $("#gc-flip", view);
  let back = false;
  const turn = (toBack = !back) => {
    back = toBack;
    flip.classList.toggle("back", back);
    $("#gc-turn", view).setAttribute("aria-pressed", String(back));
    $("#gc-back", view).setAttribute("aria-hidden", String(!back));
  };

  // live preview: everything goes in through textContent, so nothing typed is ever parsed as HTML
  const preview = () => {
    const to = f.to.value.trim(), from = f.from.value.trim(), msg = f.message.value.trim();
    $("#gc-pv-to", view).textContent = to;
    $("#gc-for", view).classList.toggle("on", !!to);
    $("#gc-pv-dear", view).textContent = to ? `Dear ${to},` : "Dear …,";
    const m = $("#gc-pv-msg", view);
    m.textContent = msg || "Your message will appear here. Write something from the heart.";
    m.classList.toggle("ph", !msg);
    m.style.setProperty("--fs", msg.length > 140 ? "3.15cqw" : msg.length > 80 ? "3.6cqw" : "4.2cqw");
    $("#gc-pv-from", view).textContent = from || "you";
    const n = f.message.value.length;
    $("#gc-count", view).textContent = `${n} / ${MAX_MSG}`;
    $("#gc-count", view).classList.toggle("near", n > MAX_MSG - 20);
    const v = via(f.toContact.value);
    $("#gc-via", view).innerHTML = v ? `${icon(v === "email" ? "mail" : "whatsapp", "", 13)} We'll send it by ${v}` : "";
  };

  const choose = (p) => {
    if (!p || p.id === sel.id) return;
    sel = p;
    $$(".gc-amt", view).forEach((el) => el.classList.toggle("on", el.dataset.id === p.id));
    if (back) turn(false);
    const im = $("#gc-front-img", view);
    const swap = () => { im.src = img(p.images[0]); im.alt = p.title; };
    if (reduced()) swap();
    else {
      $("#gc-deal", view).animate([{ transform: "none" }, { transform: "translateY(-16px) rotateZ(-3deg) scale(.95)", offset: 0.42 }, { transform: "none" }], { duration: 760, easing: "cubic-bezier(.3,1.25,.4,1)" });
      setTimeout(swap, 300);
      const front = $(".gc-front", view);
      front.classList.remove("shine"); void front.offsetWidth; front.classList.add("shine");
    }
    $("#gc-back", view).className = `gc-face gc-back t-${themeOf(p)}`;
    $("#gc-pv-amt", view).textContent = rs(p.price);
    $("#gc-add-label", view).textContent = `Add to bag · ${rs(p.price)}`;
  };

  f.addEventListener("change", (e) => { if (e.target.name === "amount") choose(state.byId[e.target.value]); });
  f.addEventListener("input", (e) => {
    preview();
    const fd = e.target.closest(".field.err");
    if (fd) { fd.classList.remove("err"); $(".msg", fd).textContent = ""; }
  });
  f.message.addEventListener("focus", () => turn(true));
  f.from.addEventListener("focus", () => turn(true));
  f.to.addEventListener("focus", () => turn(false));
  $("#gc-turn", view).onclick = () => turn();
  $("#gc-peek", view).onclick = () => { turn(true); $("#gc-stage", view).scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" }); };
  $(".gc-ideas", view).onclick = (e) => {
    const b = e.target.closest("[data-idea]");
    if (!b) return;
    f.message.value = b.dataset.idea.slice(0, MAX_MSG);
    preview();
    turn(true);
  };
  view.addEventListener("click", (e) => {
    const go = e.target.closest("[data-gc-go]");
    if (go) $(`#${go.dataset.gcGo}`, view)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  });

  // gentle 3D tilt that follows the pointer (mouse / trackpad only)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !reduced()) {
    const stage = $("#gc-stage", view), tilt = $("#gc-tilt", view);
    stage.addEventListener("pointermove", (e) => {
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${(x * 16).toFixed(2)}deg`);
      tilt.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
      tilt.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
    });
    stage.addEventListener("pointerleave", () => { tilt.style.setProperty("--rx", "0deg"); tilt.style.setProperty("--ry", "0deg"); });
  }

  f.onsubmit = (e) => {
    e.preventDefault();
    const to = f.to.value.trim(), toContact = f.toContact.value.trim(), from = f.from.value.trim(), message = f.message.value.trim();
    const errors = {};
    if (to.length < 2) errors.to = "Who is this gift card for?";
    if (!via(toContact)) errors.toContact = "Enter their WhatsApp number (03XX XXXXXXX) or email.";
    if (from.length < 2) errors.from = "Add your name so they know who it's from.";
    if (message.length > MAX_MSG) errors.message = `Please keep it under ${MAX_MSG} characters.`;
    $$(".field", f).forEach((x) => { x.classList.remove("err"); const m = $(".msg", x); if (m) m.textContent = ""; });
    for (const [k, m] of Object.entries(errors)) { const fd = $(`[data-k="${k}"]`, f); fd.classList.add("err"); $(".msg", fd).textContent = m; }
    if (Object.keys(errors).length) { $(".field.err input, .field.err textarea", f)?.focus(); return; }

    addToCart(sel.id, sel.sizes[0], 1, { meta: { digital: true, to, toContact, from, message, summary: `For ${to} · from ${from}` } });
    if (back) turn(false);
    flyToCart($("#gc-front-img", view));
    toast(`<b>${esc(rs(sel.price))} gift card</b> for ${esc(to)} is in your bag`, { icon: "gift", action: "View bag", actionData: "open-cart", href: "#" });
    const btn = $("#gc-add", view);
    btn.classList.add("done");
    $("#gc-add-label", view).textContent = "Added · make another?";
    setTimeout(() => { btn.classList.remove("done"); $("#gc-add-label", view).textContent = `Add to bag · ${rs(sel.price)}`; }, 2600);
    f.to.value = ""; f.toContact.value = ""; f.message.value = "";
    preview();
  };

  // balance check
  $("#gc-bal-f", view).onsubmit = async (e) => {
    e.preventDefault();
    const out = $("#gc-bal-out", view), btn = e.target.querySelector("button");
    const code = prettyCode(e.target.code.value);
    if (!code) { out.innerHTML = `<p class="gc-bal-err swap-in">${icon("x", "", 16)} Gift card codes look like <b>AZGC-XXXX-XXXX</b>.</p>`; return; }
    e.target.code.value = code;
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      const c = await lookup(code);
      out.innerHTML = balanceCard(c);
      countUp($(".gc-ring b", out), c.balance);
      requestAnimationFrame(() => requestAnimationFrame(() => $(".gc-ring", out)?.style.setProperty("--gc-p", c.value ? Math.round((c.balance / c.value) * 100) : 0)));
      const use = $("[data-gc-use]", out);
      if (use) use.onclick = () => {
        setCredit(KEY, { label: `Gift card ••${c.last4}`, amount: c.balance, payload: { code } });
        toast(`Gift card saved: ${rs(c.balance)} comes off your next order`, { icon: "gift", action: "View bag", actionData: "open-cart", href: "#" });
        use.outerHTML = `<span class="gc-bal-ok">${icon("circle-check", "", 16)} Saved for checkout</span>`;
      };
    } catch (err) {
      out.innerHTML = `<p class="gc-bal-err swap-in">${icon("x", "", 16)} ${esc(err.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = "Check";
    }
  };

  preview();
}

function balanceCard(c) {
  const [label, tone] = STATUS[c.status] || [c.status, "muted"];
  const usable = c.status === "active" && c.balance > 0;
  const saved = state.credits.some((x) => x.key === KEY && x.label.endsWith(c.last4));
  return `<div class="gc-bal-card swap-in">
    <div class="gc-ring" style="--gc-p:0"><div><b>${rs(0)}</b><small>of ${rs(c.value)}</small></div></div>
    <div class="gc-bal-info">
      <span class="gc-pill ${tone}">${esc(label)}</span>
      <code>${esc(c.code)}</code>
      <p>${c.status === "pending" ? "It switches on as soon as the order it came from is confirmed." : c.status === "active" ? `Valid until <b>${fmtDate(c.expiresAt)}</b>` : esc(WHY[c.status] || "")}</p>
      ${usable ? (saved ? `<span class="gc-bal-ok">${icon("circle-check", "", 16)} Saved for checkout</span>` : `<button class="btn rani sm" data-gc-use>${icon("shopping-bag", "", 15)} Use on my next order</button>`) : ""}
    </div></div>`;
}

function countUp(el, end) {
  if (!el) return;
  if (reduced()) { el.textContent = rs(end); return; }
  const t0 = performance.now();
  const step = (t) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (t - t0) / 1300);
    el.textContent = rs(end * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ================================================================== home: Eidi band
function promo(el) {
  const list = giftCards();
  if (!list.length) return;
  mount(el, `<section class="wrap gc-promo-sec"><a class="gc-promo" href="/gift-cards" data-link data-reveal="zoom">
    <span class="gc-promo-ur" aria-hidden="true">عیدی</span>
    <div class="gc-promo-copy"><span class="eyebrow">Aarzu gift cards</span>
      <h2>Give <em>Eidi</em> they'll love choosing</h2>
      <p>Digital gift cards from ${rs(list[0].price)} to ${rs(list.at(-1).price)}, sent on WhatsApp or email with your own message. Valid on everything for 12 months.</p>
      <span class="btn gold">${icon("gift", "", 16)} Send a gift card</span></div>
    <div class="gc-promo-fan" aria-hidden="true">${list.map((p, k) => `<img src="${esc(img(p.images[0]))}" alt="" style="--k:${k};--n:${list.length}" width="864" height="540" loading="lazy">`).join("")}</div>
  </a></section>`);
}

// ================================================================== checkout
function checkoutNote(el) {
  const lines = quote().items.filter(isGiftLine);
  if (!lines.length) return;
  const who = [...new Set(lines.map((i) => i.meta?.to).filter(Boolean))];
  const many = lines.reduce((s, i) => s + i.qty, 0) > 1;
  mount(el, `<div class="gc-co-note">${icon("gift", "", 20)}<div><b>Gift ${many ? "cards are" : "card is"} delivered digitally</b>
    <p>We'll send ${many ? "each code" : "the code"} with your message to ${who.length ? esc(names(who)) : "the recipient"} as soon as your payment is confirmed. Paying by bank transfer or JazzCash / Easypaisa is the quickest way to get it to them.</p></div></div>`);
}

let coOpen = false;
let lastCheck = { code: null, at: 0 };
function checkoutCredit(el, data) {
  const refresh = () => data.refresh?.();
  const applied = state.credits.find((c) => c.key === KEY);
  const box = mount(el, `<div class="gc-co"></div>`);
  if (applied) {
    const q = data.quote || quote();
    const used = q.credits.find((c) => c.key === KEY)?.amount || 0;
    const left = Math.max(0, applied.amount - used);
    box.classList.add("on");
    box.innerHTML = `<span class="gc-co-ic">${icon("gift", "", 18)}</span>
      <div class="gc-co-t"><b>${esc(applied.label)} applied</b><small>${used ? `−${rs(used)} on this order` : "Nothing left to pay on this order"}${left ? ` · ${rs(left)} stays on the card` : ""}</small></div>
      <button type="button" class="gc-co-rm">Remove</button>`;
    $(".gc-co-rm", box).onclick = () => { setCredit(KEY, null); refresh(); toast("Gift card removed", { icon: "gift" }); };
    recheck(applied, box, refresh);
    return;
  }
  box.classList.toggle("open", coOpen);
  box.innerHTML = `<button type="button" class="gc-co-toggle" aria-expanded="${coOpen}">${icon("gift", "", 18)}<span>Have an Aarzu gift card?</span>${icon("chevron-down", "gc-chev", 16)}</button>
    <div class="gc-co-drop" ${coOpen ? "" : "inert"}><div><form class="coupon gc-co-form"><input name="gc" placeholder="AZGC-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" aria-label="Gift card code"><button class="btn sm ghost">Apply</button></form></div></div>`;
  const form = $(".gc-co-form", box);
  $(".gc-co-toggle", box).onclick = (e) => {
    coOpen = !box.classList.contains("open");
    box.classList.toggle("open", coOpen);
    e.currentTarget.setAttribute("aria-expanded", String(coOpen));
    $(".gc-co-drop", box).inert = !coOpen;
    if (coOpen) setTimeout(() => form.gc.focus(), 250);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button");
    const code = prettyCode(form.gc.value);
    if (!code) return toast("Gift card codes look like AZGC-XXXX-XXXX.", { icon: "x" });
    btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
    try {
      const c = await lookup(code);
      if (c.status !== "active" || !(c.balance > 0)) throw new Error(WHY[c.status] || "This gift card has no balance left.");
      setCredit(KEY, { label: `Gift card ••${c.last4}`, amount: c.balance, payload: { code } });
      coOpen = false;
      lastCheck = { code, at: Date.now() };
      refresh();
      toast(`Gift card applied: ${rs(c.balance)} available ✨`, { icon: "gift" });
    } catch (err) {
      toast(esc(err.message), { icon: "x", ms: 5000 });
      btn.disabled = false; btn.textContent = "Apply";
    }
  };
}

// The balance may have changed since the card was applied (another order, or it was cancelled):
// check quietly at most once a minute and correct the bag.
async function recheck(applied, box, refresh) {
  const code = applied.payload?.code;
  if (!code || (lastCheck.code === code && Date.now() - lastCheck.at < 60e3)) return;
  lastCheck = { code, at: Date.now() };
  let c = null;
  try { c = await lookup(code); } catch (err) { if (err.status !== 404) return; }
  if (!box.isConnected) return;
  if (c && c.status === "active" && c.balance > 0) {
    if (c.balance !== applied.amount) { setCredit(KEY, { ...applied, amount: c.balance }); refresh(); }
    return;
  }
  setCredit(KEY, null);
  refresh();
  toast(esc(c ? WHY[c.status] || "This gift card has no balance left." : "We couldn't find that gift card any more.") + " We've removed it.", { icon: "x", ms: 6000 });
}

// ================================================================== order placed
function successNote(el, data) {
  const o = (() => { try { return JSON.parse(sessionStorage.getItem("az_last")); } catch { return null; } })();
  if (!o || o.id !== data.order) return;
  const lines = (o.quote?.items || []).filter((i) => /^AZ-GC/.test(i.id));
  if (!lines.length) return;
  const many = lines.reduce((s, i) => s + i.qty, 0) > 1;
  const who = [...new Set(lines.map((i) => i.meta?.to).filter(Boolean))];
  mount(el, `<div class="gc-success swap-in">
    <div class="gc-success-fan" aria-hidden="true">${lines.slice(0, 3).map((i, k) => `<img src="${esc(img(i.image))}" alt="" style="--k:${k}">`).join("")}</div>
    <div><span class="eyebrow">Gift ${many ? "cards" : "card"}</span><b class="serif">${who.length ? `${esc(names(who))}'s gift is ready to go` : "Your gift is ready to go"}</b>
      <ul>${lines.map((i) => `<li>${icon("gift", "", 15)} <span><b>${rs(i.unit)}</b>${i.qty > 1 ? ` ×${i.qty}` : ""} for ${esc(i.meta?.to || "your recipient")}${via(i.meta?.toContact) ? ` · by ${via(i.meta.toContact)}` : ""}</span></li>`).join("")}</ul>
      <p>We'll send ${many ? "each code" : "the code"} with your message as soon as your payment is confirmed. ${many ? "Each card is" : "It's"} valid for 12 months from the day it's sent, on everything at Aarzu.</p></div>
  </div>`);
}

// ================================================================== admin
const FILTERS = [["all", "All"], ["tosend", "To send"], ["active", "Active"], ["pending", "Awaiting payment"], ["redeemed", "Used up"], ["void", "Cancelled"], ["expired", "Expired"]];
const inFilter = (f, c) => f === "all" || (f === "tosend" ? c.status === "active" && !c.sentAt : c.status === f);

function sendText(c) {
  return [
    `Assalam o Alaikum ${c.to}! 🎁`,
    `${c.from || "Someone special"} has sent you an Aarzu gift card worth ${rs(c.initial)}.`,
    c.message ? `\n“${c.message}”\n` : "",
    `Your code: ${c.code}`,
    `Spend it on anything at ${location.origin}: just enter the code at checkout. Valid until ${fmtDate(c.expiresAt)}.`,
  ].filter(Boolean).join("\n");
}
function sendLink(c) {
  const ph = phoneOf(c.toContact);
  if (ph) return `<a class="btn wa sm" href="https://wa.me/${ph}?text=${encodeURIComponent(sendText(c))}" target="_blank" rel="noopener">${icon("whatsapp", "", 14)} WhatsApp</a>`;
  if (emailOk(c.toContact)) return `<a class="btn sm" href="mailto:${encodeURIComponent(c.toContact.trim())}?subject=${encodeURIComponent(`${c.from || "Someone"} sent you an Aarzu gift card`)}&body=${encodeURIComponent(sendText(c))}">${icon("mail", "", 14)} Email</a>`;
  return "";
}

async function adminTab(el, call) {
  el.innerHTML = `<div class="gc-admin"><p class="gc-muted">Loading gift cards…</p></div>`;
  let list = await call("/api/admin/giftcards");
  let filter = list.some((c) => inFilter("tosend", c)) ? "tosend" : "all";
  let q = "";
  el.innerHTML = `<div class="gc-admin">
    <div class="gc-admin-head"><div><h3>Gift cards <span class="ur">تحفہ کارڈ</span></h3><p>Codes switch on when their order is confirmed. Send each one to its recipient, then mark it sent.</p></div></div>
    <div class="gc-kpis" id="gc-kpis"></div>
    <div class="gc-admin-tools"><div class="gc-filter" id="gc-filter"></div><input type="search" id="gc-q" placeholder="Search code, name, order…" aria-label="Search gift cards"></div>
    <div id="gc-rows"></div></div>`;

  const draw = () => {
    const live = list.filter((c) => c.status === "active");
    $("#gc-kpis", el).innerHTML = [
      [rs(live.reduce((s, c) => s + c.balance, 0)), "Outstanding balance"],
      [live.length, "Active cards"],
      [list.filter((c) => inFilter("tosend", c)).length, "To send"],
      [list.filter((c) => c.status === "pending").length, "Awaiting payment"],
      [rs(list.filter((c) => c.status !== "void").reduce((s, c) => s + c.initial, 0)), "Value sold"],
    ].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("");
    $("#gc-filter", el).innerHTML = FILTERS.map(([k, l]) => `<button class="chip ${k === filter ? "on" : ""}" data-gc-f="${k}">${l} <small>${list.filter((c) => inFilter(k, c)).length}</small></button>`).join("");
    const shown = list.filter((c) => inFilter(filter, c) && (!q || [c.code, c.to, c.from, c.toContact, c.orderId, c.buyer].join(" ").toLowerCase().includes(q)));
    $("#gc-rows", el).innerHTML = shown.length ? `<div class="gc-table"><table><tr><th>Code</th><th>Value</th><th>Status</th><th>For · from</th><th>Order</th><th>Expires</th><th></th></tr>
      ${shown.map((c) => {
        const [label, tone] = STATUS[c.status] || [c.status, "muted"];
        return `<tr>
          <td><code class="gc-code-full">${esc(c.code)}</code><button class="gc-copy" data-gc-copy="${esc(c.code)}" aria-label="Copy code">${icon("copy", "", 14)}</button></td>
          <td><b>${rs(c.balance)}</b><small> of ${rs(c.initial)}</small><span class="gc-bar"><i style="width:${c.initial ? Math.round((c.balance / c.initial) * 100) : 0}%"></i></span></td>
          <td><span class="gc-pill ${tone}">${esc(label)}</span>${c.status === "active" ? `<br><small>${c.sentAt ? `Sent ${fmtDate(c.sentAt)}` : "<b class='gc-warn'>Not sent yet</b>"}</small>` : ""}</td>
          <td><b>${esc(c.to)}</b><br><small>${esc(c.toContact)}</small><br><small>from ${esc(c.from)}</small>${c.message ? `<p class="gc-admin-msg">“${esc(c.message)}”</p>` : ""}</td>
          <td><b>${esc(c.orderId)}</b>${c.orderStatus ? `<br><span class="status ${esc(c.orderStatus)}">${esc(c.orderStatus)}</span>` : ""}${c.history?.length ? `<br><small>${c.history.length} use${c.history.length === 1 ? "" : "s"}</small>` : ""}</td>
          <td>${c.status === "pending" ? "<small>Starts on activation</small>" : fmtDate(c.expiresAt)}</td>
          <td><div class="gc-actions">${c.status === "active" ? `${sendLink(c)}<button class="btn ghost sm" data-gc-act="sent" data-code="${esc(c.code)}">${c.sentAt ? "Sent again" : "Mark sent"}</button>` : ""}
            ${c.status === "pending" || c.status === "void" ? `<button class="btn ghost sm" data-gc-act="activate" data-code="${esc(c.code)}">Activate</button>` : ""}
            ${["pending", "active"].includes(c.status) ? `<button class="gc-void" data-gc-act="void" data-code="${esc(c.code)}">Cancel card</button>` : ""}</div></td>
        </tr>`;
      }).join("")}</table></div>`
      : `<div class="empty-state"><div class="ur">تحفہ</div><h3>${list.length ? "Nothing in this list" : "No gift cards yet"}</h3><p>${list.length ? "Try another filter or search." : "When someone buys an Aarzu gift card, its code appears here, ready to send."}</p></div>`;
  };
  draw();

  $("#gc-q", el).oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  el.onclick = async (e) => {
    const f = e.target.closest("[data-gc-f]");
    if (f) { filter = f.dataset.gcF; draw(); return; }
    const cp = e.target.closest("[data-gc-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.gcCopy); toast("Code copied"); } catch { toast(esc(cp.dataset.gcCopy)); } return; }
    const a = e.target.closest("[data-gc-act]");
    if (!a) return;
    const act = a.dataset.gcAct, code = a.dataset.code;
    if (act === "void" && !confirm(`Cancel gift card ${code}? Its balance can no longer be spent.`)) return;
    try {
      const c = await call(`/api/admin/giftcards/${encodeURIComponent(code)}`, { action: act });
      list = list.map((x) => (x.code === code ? { ...x, ...c } : x));
      draw();
      toast(act === "sent" ? `${esc(code)} marked as sent` : act === "void" ? `${esc(code)} cancelled` : `${esc(code)} is active`);
    } catch (err) { toast(esc(err.message), { icon: "x" }); }
  };
}

// ================================================================== register
export async function init() {
  registerRoute(/^\/gift-cards\/?$/, page);
  registerRoute(/^\/product\/gift-card-(\d+)\/?$/, page); // bag lines and order activity link here
  registerLink({ where: "shop", label: "Gift cards", href: "/gift-cards" });
  registerLink({ where: "menu", label: "Gift cards", href: "/gift-cards" });
  registerSlot("home-end", promo);
  registerSlot("checkout-extras", checkoutNote);
  registerSlot("checkout-credits", checkoutCredit);
  registerSlot("success-extras", successNote);
  registerAdminTab({ key: "giftcards", label: "Gift cards", render: adminTab });
}
