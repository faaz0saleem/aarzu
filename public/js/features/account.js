// Customer accounts + Aarzu Rewards · انعامات
//   header tool     user icon -> /account (the member's initial in a rani circle once signed in)
//   /account        sign in / create account, or the member dashboard: points & tier, orders,
//                   saved addresses, profile & password, points history, add an earlier order
//   /rewards        how Aarzu Rewards works: earning, redeeming, tiers, a points calculator, FAQs
//   checkout        prefills empty fields from the account, "you'll earn N points",
//                   address chips, and a "use my points" toggle (credit key "points")
//   success page    the points this order will earn, or an invitation to join and collect them
//   admin           "Customers" tab: members, points, adjustments and password resets
// The profile from /api/account/me is cached in memory and refreshed after sign-in, sign-out and orders.
// Every number shown comes from the member's real account or the real bag; nothing is invented.
import { $, $$, esc, rs, img, icon, api, state, on, toast, reveal, confetti, quote, setCredit, navigate, registerSlot, registerRoute, registerLink, registerHeaderTool, registerAdminTab } from "../core.js";

// Fallbacks match lib/routes/account.mjs; the live values come from /api/account/program.
const DEFAULT_PROGRAM = {
  welcome: 200, minRedeem: 500, perRupees: 100,
  tiers: [
    { key: "noor", name: "Noor", urdu: "نور", meaning: "light", min: 0, multiplier: 1, perks: ["1 point for every Rs 100 you spend", "200 welcome points when you join", "Saved addresses for one-tap checkout", "All your orders in one place"] },
    { key: "zar", name: "Zar", urdu: "زر", meaning: "gold", min: 2500, multiplier: 1.25, perks: ["1.25× points on every order", "Everything in Noor"] },
    { key: "shahi", name: "Shahi", urdu: "شاہی", meaning: "royal", min: 7500, multiplier: 1.5, perks: ["1.5× points on every order", "Everything in Zar"] },
  ],
};
const TIER_ICON = { noor: "sparkles", zar: "gem", shahi: "crown" };
const LEDGER = {
  welcome: ["gift", "Welcome gift"], earn: ["package", "Points earned"], reverse: ["undo-2", "Reversed · order cancelled"],
  redeem: ["badge-percent", "Used at checkout"], refund: ["refresh-ccw", "Given back · order cancelled"], adjust: ["hand-heart", "From the Aarzu team"],
};
const TABS = [["orders", "Orders"], ["addresses", "Addresses"], ["profile", "Profile"], ["points", "Points"]];
const STEPS = ["placed", "confirmed", "dispatched", "delivered"];
const MAX_ADDR = 5;

// ------------------------------------------------------------------ small helpers
const n = (x) => Math.round(Number(x) || 0).toLocaleString("en-PK");
const pts = (x) => `${n(x)} point${Math.round(x) === 1 ? "" : "s"}`;
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const initial = (name) => ([...String(name || "").trim()][0] || "A").toUpperCase();
const date = (iso, opts = { day: "numeric", month: "short", year: "numeric" }) => new Date(iso).toLocaleDateString("en-GB", opts);
// Same integer maths as the server: floor(total / 100) x tier multiplier
const earnFor = (total, mult = 1) => Math.floor((Math.max(0, Math.round(Number(total) || 0)) * Math.round(mult * 100)) / 10000);
const normPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); return /^03\d{9}$/.test(d) ? "92" + d.slice(1) : /^923\d{9}$/.test(d) ? d : null; };
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ""));
const orderId = (s) => (/^[A-Z0-9]{4,20}$/.test(String(s || "").toUpperCase()) ? String(s).toUpperCase() : null);
const safeNext = (s) => (s && /^\/(?!\/)[\w\-/?=&%.]*$/.test(s) ? s : null);
const mount = (el, html) => { el.insertAdjacentHTML("beforeend", html); return el.lastElementChild; };
const lastOrder = (id) => { try { const o = JSON.parse(sessionStorage.getItem("az_last")); return o && (!id || o.id === id) ? o : null; } catch { return null; } };
const savedCity = () => { try { return localStorage.getItem("az_city"); } catch { return null; } };
const prefs = { get: () => { try { return localStorage.getItem("az_acct_tab"); } catch { return null; } }, set: (t) => { try { localStorage.setItem("az_acct_tab", t); } catch {} } };
// Remote product photos may not load: show the Urdu watermark behind them instead of a broken icon.
const soften = (root) => $$("img[data-soft]", root).forEach((im) => { const bad = () => im.classList.add("ac-broken"); im.addEventListener("error", bad, { once: true }); if (im.complete && !im.naturalWidth) bad(); });

// ------------------------------------------------------------------ profile cache
let me = null;        // the signed-in member's profile, or null
let loaded = false;   // has the first lookup finished?
let pending = null;   // in-flight lookup
let program = null;

const hinted = () => /(?:^|;\s*)az_in=1/.test(document.cookie);
const forget = () => { document.cookie = "az_in=; Max-Age=0; Path=/; SameSite=Lax"; };

function setMe(d) {
  me = d && d.id ? d : null;
  loaded = true;
  paintTool();
  syncCredit();
  return me;
}
// Fresh lookup; only asks the server when the az_in hint says someone is signed in.
function refresh() {
  if (!hinted()) return Promise.resolve(setMe(null));
  pending = api("/api/account/me").then(setMe, (e) => { if (e.status === 401) { forget(); setMe(null); } else loaded = true; return me; });
  return pending;
}
const getMe = () => (loaded ? Promise.resolve(me) : pending || refresh());
const getProgram = async () => program || (program = await api("/api/account/program").catch(() => DEFAULT_PROGRAM));
const minRedeem = () => me?.program?.minRedeem || program?.minRedeem || DEFAULT_PROGRAM.minRedeem;

// A points credit is only valid while signed in with enough points.
function syncCredit() {
  const cur = state.credits.find((c) => c.key === "points");
  if (cur && (!me || me.points < minRedeem())) setCredit("points", null);
}
const pointsCredit = (amount) => ({ label: "Aarzu Rewards points", amount, payload: { points: amount } });

// ------------------------------------------------------------------ header tool
const toolInner = () => (me ? `<span class="ac-initial">${esc(initial(me.name))}</span>` : icon("user"));
function paintTool() {
  const el = $("#ac-tool");
  if (!el) return;
  el.innerHTML = toolInner();
  el.classList.toggle("in", !!me);
  el.setAttribute("aria-label", me ? `My account (${me.name})` : "Sign in or create an account");
  el.title = me ? `${me.name} · ${pts(me.points)}` : "Sign in";
}

// ------------------------------------------------------------------ forms
const RULES = {
  name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
  phone: (v) => (normPhone(v) ? "" : "Enter a valid Pakistani mobile number, e.g. 0300 1234567."),
  email: (v) => (!v.trim() || validEmail(v.trim()) ? "" : "That email doesn't look right."),
  password: (v) => (v.length >= 8 ? "" : "Use at least 8 characters."),
  loginPassword: (v) => (v ? "" : "Enter your password."),
  current: (v) => (v ? "" : "Enter your current password."),
  next: (v) => (v.length >= 8 ? "" : "Use at least 8 characters."),
  confirm: (v, f) => (v === f.elements.namedItem("next")?.value ? "" : "The passwords don't match."),
  address: (v) => (v.trim().length >= 8 ? "" : "Please enter the full address: house, street, area."),
  id: (v) => (orderId(v.trim()) ? "" : "Enter your order number, e.g. AZ1A2B3C45."),
};

const eyeBtn = `<button type="button" class="ac-eye" data-eye aria-label="Show password">${icon("eye", "", 18)}</button>`;
function field(form, k, label, input, { hint = "", rule = k, pw = false } = {}) {
  const id = `ac-${form}-${k}`;
  return `<div class="field" data-k="${k}" data-rule="${rule}"><label for="${id}">${label}</label>${pw ? `<div class="ac-pw">${input.replace("<input", `<input id="${id}"`)}${eyeBtn}</div>` : input.replace(/<(input|textarea|select)/, `<$1 id="${id}"`)}<span class="msg" role="alert"></span>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
}
const strength = `<div class="ac-strength" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i><span></span></div>`;
function score(pw) {
  if (!pw) return 0;
  let s = pw.length >= 8 ? 1 : 0;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) || /\d/.test(pw) && /[a-z]/i.test(pw)) s++;
  if (/[^\w\s]/.test(pw) && pw.length >= 8) s++;
  return Math.max(pw.length ? 1 : 0, Math.min(4, s));
}

function setErr(form, k, msg) {
  const fd = $(`.field[data-k="${k}"]`, form);
  if (!fd) return;
  fd.classList.toggle("err", !!msg);
  $(".msg", fd).textContent = msg || "";
}
function check(form, k) {
  const fd = $(`.field[data-k="${k}"]`, form);
  const x = form.elements.namedItem(k);
  if (!fd || !x) return "";
  const msg = RULES[fd.dataset.rule]?.(x.value, form) || "";
  setErr(form, k, msg);
  return msg;
}
const checkAll = (form) => $$(".field[data-rule]", form).map((fd) => check(form, fd.dataset.k)).filter(Boolean).length === 0;
function showErrors(form, errors = {}) {
  for (const [k, m] of Object.entries(errors)) setErr(form, k, m);
  $(".field.err input, .field.err textarea, .field.err select", form)?.focus();
}
// Inline validation: on blur, and live once a field has shown an error.
function live(form) {
  form.addEventListener("focusout", (e) => { const fd = e.target.closest(".field[data-rule]"); if (fd && e.target.value !== "") check(form, fd.dataset.k); });
  form.addEventListener("input", (e) => {
    const fd = e.target.closest(".field[data-rule]");
    if (fd?.classList.contains("err")) check(form, fd.dataset.k);
    const st = e.target.name === "password" || e.target.name === "next" ? $(".ac-strength", form) : null;
    if (st) { const s = score(e.target.value); st.dataset.s = s; $("span", st).textContent = ["", "Weak", "Okay", "Good", "Strong"][s]; }
  });
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-eye]");
    if (!b) return;
    const x = b.previousElementSibling;
    const show = x.type === "password";
    x.type = show ? "text" : "password";
    b.classList.toggle("on", show);
    b.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
}
async function busy(btn, label, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span> ${label}`;
  try { return await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}

// ------------------------------------------------------------------ /account (signed out)
function authView(view, { url, claim, mode }) {
  const p = program || DEFAULT_PROGRAM;
  const last = claim ? lastOrder(claim) : null;
  const c = last?.customer || {};
  const claimPts = last ? earnFor(last.total) : 0;
  view.onclick = view.onsubmit = null;
  view.innerHTML = `<section class="phero ac-hero"><span class="ac-hero-ur" aria-hidden="true">آرزو</span>
      <span class="eyebrow">My account</span><h1 style="margin-top:12px">Welcome <em>home</em></h1><div class="urdu">خوش آمدید</div>
      <p>Sign in to see your orders, keep your addresses and collect Aarzu Rewards points on everything you wear.</p></section>
    <section class="wrap ac-auth-sec"><div class="ac-auth">
      <aside class="ac-teaser" data-reveal="left">
        <div class="ac-medal" aria-hidden="true"><span><b>${n(p.welcome)}</b><small>welcome points</small></span></div>
        <div class="ac-teaser-t"><span class="eyebrow">Aarzu Rewards</span><h2>Shop, collect, <em>save</em></h2><span class="urdu">انعامات</span></div>
        <ul class="ac-ticks">
          <li>${icon("check", "", 16)}<span><b>1 point</b> for every ${rs(p.perRupees)} you spend</span></li>
          <li>${icon("check", "", 16)}<span><b>1 point = ${rs(1)} off</b>, from ${n(p.minRedeem)} points</span></li>
          <li>${icon("check", "", 16)}<span><b>${p.tiers.map((t) => esc(t.name)).join(", ")}</b> tiers, up to ${p.tiers.at(-1).multiplier}× points</span></li>
          <li>${icon("check", "", 16)}<span>Saved addresses &amp; <b>one-tap checkout</b></span></li>
        </ul>
        <a class="link under ac-teaser-a" href="/rewards" data-link>How rewards work ${icon("arrow-right", "", 16)}</a>
      </aside>
      <div class="ac-card card-box" data-reveal="right">
        ${claim ? `<div class="ac-claim-note">${icon("gift", "", 20)}<span>Sign in or join with the number you ordered with, and we'll add order <b>${esc(claim)}</b> to your account${claimPts ? `: <b>${pts(claimPts)}</b> when it's delivered` : ""}.</span></div>` : ""}
        <div class="tabs ac-modes" role="tablist"><button type="button" role="tab" data-mode="login">Sign in</button><button type="button" role="tab" data-mode="register">Create account</button></div>
        <form id="ac-login" class="ac-form" novalidate>
          ${field("login", "phone", "Mobile number", `<input name="phone" inputmode="tel" autocomplete="tel" placeholder="03XX XXXXXXX" value="${esc(c.phone || "")}">`)}
          ${field("login", "password", "Password", `<input name="password" type="password" autocomplete="current-password">`, { rule: "loginPassword", pw: true })}
          <button class="btn rani block">${icon("lock", "", 16)} Sign in</button>
          <p class="ac-fine">Forgot your password? <a href="https://wa.me/${esc(state.store.contact.whatsapp)}?text=${encodeURIComponent("Assalam o Alaikum Aarzu! I've forgotten my account password.")}" target="_blank" rel="noopener">Message us on WhatsApp</a> and we'll reset it for you.</p>
        </form>
        <form id="ac-register" class="ac-form" novalidate>
          ${field("register", "name", "Full name", `<input name="name" autocomplete="name" value="${esc(c.name || "")}">`)}
          ${field("register", "phone", "Mobile number", `<input name="phone" inputmode="tel" autocomplete="tel" placeholder="03XX XXXXXXX" value="${esc(c.phone || "")}">`, { hint: "You'll sign in with this number. Orders placed with it can be added to your account." })}
          ${field("register", "email", "Email (optional)", `<input name="email" type="email" autocomplete="email" value="${esc(c.email || "")}">`)}
          ${field("register", "password", "Password", `<input name="password" type="password" autocomplete="new-password" minlength="8">`, { pw: true, hint: strength })}
          <button class="btn rani block">${icon("sparkles", "", 16)} Create account · ${n(p.welcome)} points</button>
          <p class="ac-fine">Free to join. We'll never share your number.</p>
        </form>
      </div></div></section>`;

  const card = $(".ac-card", view);
  const setMode = (m) => {
    $$(".ac-modes button", card).forEach((b) => { const on = b.dataset.mode === m; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $$(".ac-form", card).forEach((f) => { const on = f.id === `ac-${m}`; f.hidden = !on; if (on) { f.classList.remove("swap-in"); void f.offsetWidth; f.classList.add("swap-in"); } });
  };
  setMode(mode === "register" || (claim && mode !== "login") ? "register" : "login");
  card.addEventListener("click", (e) => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); });

  const done = (d, isNew) => {
    setMe(d);
    if (isNew) { confetti(140); toast(`Khush aamdeed, ${esc(first(d.name))}! ${pts(p.welcome)} are in your account.`, { icon: "gift", ms: 5200 }); }
    else toast(`Welcome back, ${esc(first(d.name))}`, { icon: "circle-check" });
    if (d.claimed) setTimeout(() => toast(`Order ${esc(claim)} is now in your account`, { icon: "package" }), 900);
    const next = safeNext(url.searchParams.get("next"));
    if (next) return navigate(next);
    history.replaceState({}, "", "/account");
    dashView(view, { tab: d.claimed || claim ? "orders" : undefined });
    scrollTo({ top: 0, behavior: "smooth" });
  };
  for (const form of $$(".ac-form", view)) {
    live(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!checkAll(form)) return $(".field.err input", form)?.focus();
      const isNew = form.id === "ac-register";
      const val = (k) => form.elements.namedItem(k)?.value ?? "";
      const body = isNew ? { name: val("name").trim(), phone: val("phone"), email: val("email").trim(), password: val("password") } : { phone: val("phone"), password: val("password") };
      if (claim) body.claim = claim;
      await busy($("button.btn", form), isNew ? "Creating your account…" : "Signing in…", async () => {
        try { done(await api(isNew ? "/api/account/register" : "/api/account/login", body), isNew); }
        catch (err) {
          showErrors(form, err.data?.errors);
          toast(esc(err.message), { icon: "x" });
          if (err.status === 409 && isNew) setTimeout(() => { setMode("login"); const lf = $("#ac-login", view); lf.elements.namedItem("phone").value = val("phone"); lf.elements.namedItem("password").focus(); }, 1200);
        }
      });
    });
  }
}

// ------------------------------------------------------------------ /account (dashboard)
function pointsCard(m) {
  const t = m.tier, nx = m.nextTier, min = minRedeem();
  const pct = nx ? Math.max(3, Math.min(100, ((m.lifetimePoints - t.min) / (nx.min - t.min)) * 100)) : 100;
  return `<div class="ac-points ac-${esc(t.key)}" data-reveal="zoom">
    <div class="ac-points-top"><span class="ac-badge ac-${esc(t.key)}">${icon(TIER_ICON[t.key] || "award", "", 15)} ${esc(t.name)}<span class="ur">${esc(t.urdu)}</span></span><span class="ac-mult">${t.multiplier > 1 ? `${t.multiplier}× points` : `1 point per ${rs(100)}`}</span></div>
    <div class="ac-bal"><b data-count="${m.points}">0</b><span>points<br><small>worth ${rs(m.points)}</small></span></div>
    <div class="ac-meter"><div class="ac-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Progress to the next tier"><i style="--w:${pct}%"></i><span class="ac-gem" style="--w:${pct}%">${icon(nx ? TIER_ICON[nx.key] || "gem" : "crown", "", 14)}</span></div>
      <div class="ac-meter-l"><span>${n(m.lifetimePoints)} lifetime</span><span>${nx ? `<b>${n(nx.toGo)}</b> to ${esc(nx.name)} <span class="ur">${esc(nx.urdu)}</span>` : "Our highest tier ✦"}</span></div></div>
    <div class="ac-chips">
      ${m.pending ? `<span class="ac-chip pend">${icon("clock", "", 14)} +${pts(m.pending)} on the way</span>` : ""}
      ${m.points >= min ? `<a class="ac-chip ok" href="/shop" data-link>${icon("badge-percent", "", 14)} ${rs(m.points)} off ready to use</a>` : `<span class="ac-chip">${icon("lock", "", 14)} ${pts(min - m.points)} more to start saving</span>`}
    </div></div>`;
}

function dashView(view, { tab, claim } = {}) {
  const m = me;
  const t = TABS.some(([k]) => k === tab) ? tab : TABS.some(([k]) => k === prefs.get()) ? prefs.get() : "orders";
  view.innerHTML = `<section class="ac-dash-hero ac-${esc(m.tier.key)}"><div class="ac-dash-pattern" aria-hidden="true"></div>
      <div class="wrap ac-dash-top">
        <div class="ac-hello">
          <span class="eyebrow">My account · Aarzu Rewards</span>
          <h1>Khush Aamdeed,<br><em>${esc(first(m.name))}</em></h1>
          <div class="urdu">خوش آمدید</div>
          <p>Member since ${date(m.createdAt, { month: "long", year: "numeric" })} · ${esc(m.phoneDisplay)}</p>
          <div class="ac-hello-ctas"><a class="btn rani sm" href="/shop?sort=new" data-link>${icon("sparkles", "", 15)} New arrivals</a><a class="btn ghost-light sm" href="/rewards" data-link>How rewards work</a></div>
        </div>
        ${pointsCard(m)}
      </div></section>
    <section class="wrap ac-dash">
      <div class="ac-tabs-row"><div class="tabs ac-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${k === t ? "on" : ""}" aria-selected="${k === t}">${l}${k === "orders" ? `<span class="ac-count" ${m.orders.length ? "" : "hidden"}>${m.orders.length}</span>` : ""}</button>`).join("")}</div>
        <button type="button" class="btn ghost sm ac-out" data-signout>${icon("log-out", "", 15)} Sign out</button></div>
      <div class="ac-panel" id="ac-panel"></div>
    </section>`;
  const panel = $("#ac-panel", view);
  const show = (k) => {
    prefs.set(k);
    $$(".ac-tabs button", view).forEach((b) => { const on = b.dataset.tab === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    panel.innerHTML = PANELS[k](me);
    panel.dataset.cur = k;
    panel.classList.remove("swap-in"); void panel.offsetWidth; panel.classList.add("swap-in");
    soften(panel);
    reveal(panel);
  };
  // After a change: refresh the open panel, and the points card only if the numbers moved.
  const sig = (x) => [x.points, x.lifetimePoints, x.pending, x.tier.key].join();
  const redraw = (d, tab) => {
    const before = sig(me);
    setMe(d);
    if (!me) return;
    if (sig(me) !== before) { $(".ac-points", view).outerHTML = pointsCard(me); reveal(view); }
    $(".ac-hello h1 em", view).textContent = first(me.name);
    const c = $(".ac-count", view);
    c.textContent = me.orders.length;
    c.hidden = !me.orders.length;
    show(tab || panel.dataset.cur);
  };
  view.onclick = async (e) => {
    const tb = e.target.closest("button[data-tab]");
    if (tb) return show(tb.dataset.tab);
    if (e.target.closest("[data-signout]")) return signOut(view);
    if (e.target.closest("[data-goto]")) return show(e.target.closest("[data-goto]").dataset.goto);
    addressClick(e, view, redraw);
  };
  view.onsubmit = (e) => { e.preventDefault(); submitPanel(e.target, view, redraw); };
  show(t);
  reveal(view);
  if (claim) claimOrder(claim, redraw);
}

async function claimOrder(id, redraw, form) {
  if (!form) history.replaceState({}, "", "/account");
  try {
    const d = await api("/api/account/claim", { id });
    toast(d.already ? `Order ${esc(id)} is already in your account` : `Order ${esc(id)} added to your account`, { icon: "package" });
    redraw(d, "orders");
  } catch (err) {
    if (form?.isConnected) showErrors(form, err.data?.errors);
    toast(esc(err.message), { icon: "x", ms: 5000 });
  }
}

async function signOut(view) {
  try { await api("/api/account/logout", {}); } catch {}
  forget();
  setMe(null);
  toast("You're signed out. Phir milenge!", { icon: "log-out" });
  history.replaceState({}, "", "/account");
  authView(view, { url: new URL(location.href) });
  reveal(view);
  scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------------ dashboard panels
function orderCard(o, i) {
  const at = STEPS.indexOf(o.status);
  const ptsLine = o.pointsState === "pending" ? `<span class="ac-pts pending">${icon("clock", "", 13)} +${pts(o.points)} when delivered</span>`
    : o.pointsState === "earned" ? `<span class="ac-pts earned">${icon("gem", "", 13)} +${pts(o.points)} earned</span>`
    : o.status === "cancelled" ? `<span class="ac-pts none">No points · cancelled</span>` : "";
  return `<article class="ac-order" data-reveal style="--i:${Math.min(i, 6)}">
    <a class="ac-ph" href="/track?id=${esc(o.id)}" data-link aria-label="Track order ${esc(o.id)}"><span class="ur" aria-hidden="true">آرزو</span>${o.image ? `<img data-soft src="${esc(img(o.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</a>
    <div class="ac-o-main">
      <div class="ac-o-top"><b>${esc(o.id)}</b><span class="status ${esc(o.status)}">${esc(o.status)}</span></div>
      <div class="ac-o-title">${esc(o.title)}${o.lines > 1 ? ` <small>+${o.lines - 1} more</small>` : ""}</div>
      <div class="ac-o-meta">${date(o.createdAt)} · ${o.items} item${o.items === 1 ? "" : "s"} · <b>${rs(o.total)}</b></div>
      ${o.status === "cancelled" ? "" : `<div class="ac-steps" aria-label="Status: ${esc(o.status)}">${STEPS.map((s, k) => `<i class="${k <= at ? "done" : ""}" title="${s}"></i>`).join("")}</div>`}
      <div class="ac-o-foot">${ptsLine}${o.usedPoints ? `<span class="ac-pts used">${icon("badge-percent", "", 13)} ${pts(o.usedPoints)} used</span>` : ""}<a class="link ac-track" href="/track?id=${esc(o.id)}" data-link>Track ${icon("arrow-right", "", 14)}</a></div>
    </div></article>`;
}

const claimForm = (m) => `<form class="ac-claim card-box" data-form="claim" novalidate>
    <div class="ac-claim-t"><span class="ac-claim-ic">${icon("package", "", 20)}</span><div><b>Ordered before you joined?</b><small>Add any order placed with ${esc(m.phoneDisplay)} using its order number. Delivered orders earn their points straight away.</small></div></div>
    <div class="ac-claim-row">${field("claim", "id", "Order number", `<input name="id" placeholder="AZ…" autocapitalize="characters" autocomplete="off" spellcheck="false">`)}<button class="btn ghost sm">Add order</button></div>
  </form>`;

const PANELS = {
  orders: (m) => `${m.orders.length ? `<div class="ac-orders">${m.orders.map(orderCard).join("")}</div>`
      : `<div class="empty-state ac-empty"><div class="ur">پہلا آرڈر</div><h3>Your first order is waiting</h3><p>Every order you place while signed in appears here, with its points.</p><a class="btn rani" href="/shop" data-link>Start shopping</a></div>`}
    ${claimForm(m)}`,

  addresses: (m) => `<div class="ac-sub"><h3>Saved addresses <span class="ur">پتے</span></h3><p>We'll fill these in at checkout. Your first address is the default.</p></div>
    <div class="ac-addrs">${m.addresses.map((a, i) => `<div class="ac-addr ${i ? "" : "def"}" data-reveal style="--i:${i}">
        <div class="ac-addr-h"><span class="ac-addr-ic">${icon(i ? "map-pin" : "house", "", 18)}</span><b>${esc(a.label)}</b>${i ? "" : `<span class="ac-def">Default</span>`}</div>
        <p>${esc(a.address)}<span>${esc(a.city)}</span></p>
        <div class="ac-addr-act"><button type="button" data-edit="${i}">Edit</button>${i ? `<button type="button" data-default="${i}">Make default</button>` : ""}<button type="button" data-del="${i}">Delete</button></div>
      </div>`).join("")}
      ${m.addresses.length < MAX_ADDR ? `<button type="button" class="ac-addr add" data-add data-reveal style="--i:${m.addresses.length}">${icon("plus", "", 22)}<b>Add an address</b><small>${MAX_ADDR - m.addresses.length} of ${MAX_ADDR} left</small></button>` : ""}
    </div><div id="ac-addr-form"></div>`,

  profile: (m) => `<div class="ac-forms">
      <form class="card-box ac-form" data-form="profile" novalidate><h3>Your details</h3>
        ${field("profile", "name", "Full name", `<input name="name" autocomplete="name" value="${esc(m.name)}">`)}
        <div class="field"><label>Mobile number</label><input value="${esc(m.phoneDisplay)}" disabled><span class="hint">Your number is how you sign in. To change it, message us on WhatsApp.</span></div>
        ${field("profile", "email", "Email (optional)", `<input name="email" type="email" autocomplete="email" value="${esc(m.email)}">`)}
        <button class="btn rani">Save details</button></form>
      <form class="card-box ac-form" data-form="password" novalidate><h3>Change password</h3>
        ${field("pw", "current", "Current password", `<input name="current" type="password" autocomplete="current-password">`, { pw: true })}
        ${field("pw", "next", "New password", `<input name="next" type="password" autocomplete="new-password">`, { pw: true, hint: strength })}
        ${field("pw", "confirm", "Confirm new password", `<input name="confirm" type="password" autocomplete="new-password">`, { pw: true })}
        <button class="btn ghost">Update password</button><p class="ac-fine">Changing it signs you out on your other devices.</p></form>
    </div>
    <div class="ac-bye"><span class="urdu">خدا حافظ</span><button type="button" class="btn ghost sm" data-signout>${icon("log-out", "", 15)} Sign out of this device</button></div>`,

  points: (m) => `<div class="ac-pts-grid">
      <div class="card-box ac-ledger"><h3>Points history</h3>
        ${m.ledger.length ? `<ul>${m.ledger.map((l, i) => { const [ic, label] = LEDGER[l.type] || ["sparkles", l.type]; return `<li data-reveal style="--i:${Math.min(i, 8)}"><span class="ac-l-ic t-${esc(l.type)}">${icon(ic, "", 16)}</span><div><b>${esc(label)}</b><small>${date(l.at)}${l.orderId ? ` · ${esc(l.orderId)}` : ""}${l.note ? ` · ${esc(l.note)}` : ""}</small></div><span class="ac-l-pts ${l.points >= 0 ? "plus" : "minus"}">${l.points >= 0 ? "+" : "−"}${n(Math.abs(l.points))}</span></li>`; }).join("")}</ul>` : `<p class="ac-fine">No points activity yet.</p>`}
        ${m.ledger.length >= 20 ? `<p class="ac-fine">Showing your latest 20 entries.</p>` : ""}</div>
      <div class="ac-pts-side">
        <div class="card-box ac-stat"><span>Balance</span><b>${n(m.points)}</b><small>= ${rs(m.points)} off</small></div>
        <div class="card-box ac-stat"><span>Lifetime points</span><b>${n(m.lifetimePoints)}</b><small>decide your tier</small></div>
        <div class="card-box ac-stat"><span>On the way</span><b>${n(m.pending)}</b><small>land when orders are delivered</small></div>
        <a class="btn gold block" href="/rewards" data-link>${icon(TIER_ICON[m.tier.key] || "gem", "", 16)} Tiers &amp; perks</a>
      </div></div>`,
};

// ------------------------------------------------------------------ addresses
function addrForm(a = {}, i = -1) {
  const labels = ["Home", "Work", "Family"];
  return `<form class="card-box ac-form ac-addr-form swap-in" data-form="address" data-i="${i}" novalidate>
    <h3>${i >= 0 ? "Edit address" : "New address"}</h3>
    <div class="field"><label>Label</label><div class="ac-labels">${labels.map((l) => `<button type="button" class="chip ${(a.label || "Home") === l ? "on" : ""}" data-label="${l}">${l}</button>`).join("")}<input name="label" maxlength="30" value="${esc(a.label || "Home")}" aria-label="Address label"></div></div>
    ${field("addr", "city", "City", `<select name="city">${state.store.cities.map((c) => `<option ${c.name === (a.city || savedCity()) ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>`, { rule: "" })}
    ${field("addr", "address", "Full address", `<textarea name="address" autocomplete="street-address" placeholder="House, street, area, landmark">${esc(a.address || "")}</textarea>`)}
    <div class="ac-form-btns"><button class="btn rani sm">${icon("check", "", 15)} Save address</button><button type="button" class="btn ghost sm" data-cancel>Cancel</button></div>
  </form>`;
}

async function saveAddresses(list, redraw, msg) {
  try { redraw(await api("/api/account/me", { addresses: list }, "PUT")); toast(msg, { icon: "map-pin" }); }
  catch (err) { toast(esc(err.message), { icon: "x" }); }
}

function addressClick(e, view, redraw) {
  const host = $("#ac-addr-form", view);
  if (!me || !host) return;
  const list = me.addresses.slice();
  const open = (html) => { host.innerHTML = html; const f = $("form", host); live(f); f.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => f.elements.namedItem("address")?.focus({ preventScroll: true }), 350); };
  if (e.target.closest("[data-add]")) return open(addrForm());
  const ed = e.target.closest("[data-edit]");
  if (ed) return open(addrForm(list[ed.dataset.edit], Number(ed.dataset.edit)));
  if (e.target.closest("[data-cancel]")) return (host.innerHTML = "");
  const lb = e.target.closest("[data-label]");
  if (lb) { const f = lb.closest("form"); f.elements.namedItem("label").value = lb.dataset.label; $$("[data-label]", f).forEach((b) => b.classList.toggle("on", b === lb)); return; }
  const df = e.target.closest("[data-default]");
  if (df) { const [a] = list.splice(Number(df.dataset.default), 1); return saveAddresses([a, ...list], redraw, `${esc(a.label)} is now your default address`); }
  const del = e.target.closest("[data-del]");
  if (del) {
    // Tap twice to delete: no blocking confirm dialogs.
    if (!del.classList.contains("sure")) { del.classList.add("sure"); del.textContent = "Tap to confirm"; setTimeout(() => { if (del.isConnected) { del.classList.remove("sure"); del.textContent = "Delete"; } }, 3000); return; }
    const [a] = list.splice(Number(del.dataset.del), 1);
    return saveAddresses(list, redraw, `${esc(a.label)} address deleted`);
  }
}

// ------------------------------------------------------------------ panel forms
async function submitPanel(form, view, redraw) {
  const kind = form.dataset.form;
  if (!kind || !checkAll(form)) return $(".field.err input, .field.err textarea", form)?.focus();
  const val = (k) => form.elements.namedItem(k)?.value ?? "";
  const btn = $("button.btn:not([type=button])", form);
  await busy(btn, "Saving…", async () => {
    try {
      if (kind === "profile") { redraw(await api("/api/account/me", { name: val("name").trim(), email: val("email").trim() }, "PUT")); toast("Your details are saved"); }
      if (kind === "password") { await api("/api/account/password", { current: val("current"), next: val("next") }); form.reset(); const st = $(".ac-strength", form); st.dataset.s = 0; $("span", st).textContent = ""; toast("Password updated", { icon: "lock" }); }
      if (kind === "address") {
        const list = me.addresses.slice(), i = Number(form.dataset.i);
        const a = { label: val("label").trim() || "Home", city: val("city"), address: val("address").trim() };
        if (i >= 0) list[i] = a; else list.push(a);
        await saveAddresses(list, redraw, i >= 0 ? "Address updated" : "Address saved");
      }
      if (kind === "claim") await claimOrder(val("id").trim().toUpperCase(), redraw, form);
    } catch (err) { showErrors(form, err.data?.errors); toast(esc(err.message), { icon: "x" }); }
  });
}

// ------------------------------------------------------------------ routes
async function accountPage(view, { url }) {
  const claim = orderId(url.searchParams.get("claim"));
  const mode = url.searchParams.get("mode");
  await Promise.all([refresh(), getProgram()]);
  if (me) dashView(view, { tab: url.searchParams.get("tab"), claim });
  else authView(view, { url, claim, mode });
  soften(view);
}

function tierCard(t, i, cur) {
  const here = cur && cur.key === t.key;
  return `<article class="ac-tier ac-${esc(t.key)} ${here ? "here" : ""}" data-reveal style="--i:${i}">
    ${here ? `<span class="ac-here">You are here</span>` : ""}
    <span class="ac-tier-ic">${icon(TIER_ICON[t.key] || "award", "", 26)}</span>
    <div class="ac-tier-ur">${esc(t.urdu)}</div>
    <h3>${esc(t.name)} <small>· ${esc(t.meaning)}</small></h3>
    <div class="ac-tier-min">${t.min ? `From <b>${n(t.min)}</b> lifetime points` : "From your first day"}</div>
    <div class="ac-tier-x"><b>${t.multiplier}×</b><span>points on<br>every order</span></div>
    <ul>${t.perks.map((p) => `<li>${icon("check", "", 15)}<span>${esc(p)}</span></li>`).join("")}</ul>
  </article>`;
}

async function rewardsPage(view) {
  const [p] = await Promise.all([getProgram(), refresh()]);
  const cur = me?.tier;
  const ctas = me
    ? `<a class="btn rani" href="/account" data-link>${icon("gem", "", 16)} You have ${pts(me.points)}</a><a class="btn ghost-light" href="/shop" data-link>Shop now</a>`
    : `<a class="btn rani" href="/account?mode=register" data-link>${icon("gift", "", 16)} Join free · ${n(p.welcome)} points</a><a class="btn ghost-light" href="/account?mode=login" data-link>Sign in</a>`;
  view.innerHTML = `<section class="ac-rw-hero"><div class="ac-dash-pattern" aria-hidden="true"></div><span class="ac-rw-ur" aria-hidden="true">انعام</span>
      <div class="wrap"><span class="eyebrow">Aarzu Rewards</span>
        <h1>Every order brings you closer to your next <em class="grad-text">aarzu</em></h1>
        <div class="urdu">آرزو انعامات</div>
        <p>Join free and get <b>${n(p.welcome)} points</b>. Earn 1 point for every ${rs(p.perRupees)} you spend, then use them as rupees off: <b>1 point = ${rs(1)}</b>.</p>
        <div class="ac-rw-ctas">${ctas}</div></div></section>
    <section class="sec wrap"><div class="sec-head"><span class="eyebrow">How it works</span><h2>Four simple <em>steps</em></h2><div class="urdu">طریقہ</div></div>
      <div class="ac-how">${[
        ["gift", "Join", `Create a free account and get ${n(p.welcome)} welcome points.`, "#D6246E"],
        ["shopping-bag", "Shop", `Earn 1 point for every ${rs(p.perRupees)} you pay, signed in at checkout.`, "#F2A900"],
        ["truck", "Receive", "Points land in your account the moment your order is delivered.", "#0FA3A3"],
        ["badge-percent", "Save", `From ${n(p.minRedeem)} points, switch on "Use my points" at checkout. 1 point = ${rs(1)} off.`, "#0B5D4B"],
      ].map(([ic, t, d, c], i) => `<div class="ac-step" data-reveal style="--i:${i};--c:${c}"><span class="ac-step-n">${i + 1}</span><span class="ac-step-ic">${icon(ic, "", 24)}</span><h4>${t}</h4><p>${d}</p></div>`).join("")}</div></section>
    <section class="sec ac-tiers-sec"><div class="wrap"><div class="sec-head"><span class="eyebrow">Tiers</span><h2>Three tiers, one <em>wish</em></h2><div class="urdu">تین درجے</div><p>Your tier is set by the points you've earned over time, and spending points never lowers it.</p></div>
      <div class="ac-tiers">${p.tiers.map((t, i) => tierCard(t, i, cur)).join("")}</div></div></section>
    <section class="sec wrap"><div class="ac-calc card-box" data-reveal>
      <div class="ac-calc-l"><span class="eyebrow">Points calculator</span><h3>What would you earn?</h3>
        <label class="ac-range"><span>Order total <b id="ac-spend"></b></span><input type="range" id="ac-r" min="1000" max="50000" step="500" value="8000" aria-label="Order total"></label>
        <p class="ac-fine">Points are earned on the amount you pay, after discounts and any points you use.</p></div>
      <div class="ac-calc-r" id="ac-calc-out"></div></div></section>
    <section class="sec wrap" style="padding-top:0"><div class="sec-head"><span class="eyebrow">Good to know</span><h2>Rewards <em>questions</em></h2><div class="urdu">سوالات</div></div>
      <div class="prose">${[
        ["When do my points arrive?", "As soon as your order is marked delivered. Until then you'll see them as \"on the way\" in your account."],
        ["How do I use my points?", `Once you have ${n(p.minRedeem)} or more, switch on "Use my points" in the order summary at checkout. Each point takes ${rs(1)} off, up to the full order total.`],
        ["Can I use points with a discount code?", "Yes. Points are applied last, after discounts and delivery, so you get both."],
        ["Do my points expire?", "No. Your points stay in your account for as long as you have it."],
        ["What happens if an order is cancelled?", "Points earned on a cancelled order are taken back, and any points you spent on it are returned to your balance."],
        ["I ordered before I had an account.", "Sign in, open Orders and add it with its order number. It needs to have been placed with the same mobile number as your account."],
      ].map(([q, a], i) => `<details class="acc" ${i ? "" : "open"} data-reveal style="--i:${i}"><summary>${q} ${icon("plus", "", 16)}</summary><div class="body">${esc(a)}</div></details>`).join("")}</div></section>
    <section class="wrap ac-rw-end"><div class="ac-rw-band" data-reveal="zoom"><div><span class="urdu">آپ کی آرزو، ہمارا انعام</span><h3>${me ? `${esc(first(me.name))}, you have <em>${pts(me.points)}</em>` : `Start with <em>${n(p.welcome)} points</em> on us`}</h3></div>${me ? `<a class="btn gold" href="/shop" data-link>Find something beautiful</a>` : `<a class="btn gold" href="/account?mode=register" data-link>Create my account</a>`}</div></section>`;

  const r = $("#ac-r", view), out = $("#ac-calc-out", view);
  const calc = () => {
    const v = Number(r.value);
    $("#ac-spend", view).textContent = rs(v);
    r.style.setProperty("--p", `${((v - r.min) / (r.max - r.min)) * 100}%`);
    out.innerHTML = p.tiers.map((t) => { const e = earnFor(v, t.multiplier); return `<div class="ac-calc-t ac-${esc(t.key)} ${cur?.key === t.key ? "here" : ""}"><span>${icon(TIER_ICON[t.key] || "award", "", 16)} ${esc(t.name)}</span><b>${n(e)}</b><small>points · ${rs(e)} off later</small></div>`; }).join("")
      + `<p class="ac-calc-note">${(() => { const e = earnFor(v, cur?.multiplier || 1), need = Math.max(0, p.minRedeem - (me ? me.points : p.welcome)); return need === 0 ? `You can already use your points at checkout.` : e ? `About <b>${Math.ceil(need / e)}</b> order${Math.ceil(need / e) === 1 ? "" : "s"} like this ${me ? "unlock" : "plus your welcome points unlock"} your first ${rs(p.minRedeem)} off.` : ""; })()}</p>`;
  };
  r.oninput = calc;
  calc();
}

// ------------------------------------------------------------------ checkout + success slots
function prefill(form) {
  if (!form || !me) return false;
  const fill = (k, v) => { const x = form.elements.namedItem(k); if (x && v && !x.value.trim()) { x.value = v; x.closest(".field")?.classList.add("ac-filled"); return true; } return false; };
  fill("name", me.name);
  fill("phone", me.phoneDisplay);
  fill("email", me.email);
  const a = me.addresses[0];
  if (a && fill("address", a.address)) { setCity(form, a.city); return true; }
  return false;
}
function setCity(form, city) {
  const s = form.elements.namedItem("city");
  if (!s || ![...s.options].some((o) => o.value === city) || s.value === city) return;
  s.value = city;
  s.dispatchEvent(new Event("change", { bubbles: true }));
}

registerSlot("checkout-extras", (el) => {
  const box = mount(el, `<div class="ac-co-wrap" aria-live="polite"></div>`);
  const form = el.closest("form");
  let chosen = -1;
  const paint = () => {
    const total = quote().total;
    if (me) {
      const e = earnFor(total, me.tier.multiplier);
      box.innerHTML = `<div class="ac-co in"><span class="ac-co-av">${esc(initial(me.name))}</span><div class="ac-co-t"><b>Signed in as ${esc(me.name)}</b><small>${e ? `You'll earn <b>${pts(e)}</b> on this order${me.tier.multiplier > 1 ? ` · ${esc(me.tier.name)} ${me.tier.multiplier}×` : ""}` : "Your points balance is in your account"}</small></div><span class="ac-co-pts">${icon(TIER_ICON[me.tier.key] || "gem", "", 14)} ${n(me.points)}</span>
        ${me.addresses.length > 1 ? `<div class="ac-co-addr"><span>Deliver to</span>${me.addresses.map((a, i) => `<button type="button" class="chip ${i === chosen ? "on" : ""}" data-use-addr="${i}">${icon(i ? "map-pin" : "house", "", 14)} ${esc(a.label)}</button>`).join("")}</div>` : ""}</div>`;
    } else {
      const e = earnFor(total);
      box.innerHTML = `<a class="ac-co out" href="/account?next=/checkout" data-link><span class="ac-co-ic">${icon("sparkles", "", 18)}</span><span class="ac-co-t"><b>${e ? `Sign in to earn ${pts(e)} on this order` : "Sign in for faster checkout"}</b><small>New here? Join free and get ${n((program || DEFAULT_PROGRAM).welcome)} welcome points.</small></span>${icon("arrow-right", "", 18)}</a>`;
    }
  };
  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-use-addr]");
    if (!b || !form) return;
    const a = me?.addresses[Number(b.dataset.useAddr)];
    if (!a) return;
    form.elements.namedItem("address").value = a.address;
    setCity(form, a.city);
    chosen = Number(b.dataset.useAddr);
    $$("[data-use-addr]", box).forEach((x) => x.classList.toggle("on", x === b));
    toast(`Delivering to ${esc(a.label)}`, { icon: "map-pin", ms: 2200 });
  });
  getMe().then(() => { if (!box.isConnected) return; if (prefill(form)) chosen = 0; paint(); });
  const off = on((what) => { if (!box.isConnected) return off(); if (what === "cart") paint(); });
});

registerSlot("checkout-credits", (el, data) => {
  const draw = () => {
    if (!el.isConnected || !data.quote) return;
    const cur = state.credits.find((c) => c.key === "points");
    const min = minRedeem(), q = data.quote;
    // Signed out, or below the minimum: make sure no points credit lingers in the summary.
    if (!me || me.points < min) {
      if (cur) setCredit("points", null);
      if (q.credits.some((c) => c.key === "points")) setTimeout(() => data.refresh?.(), 0);
    }
    if (!me) return;
    if (me.points < min) {
      mount(el, `<div class="ac-redeem locked">${icon("lock", "", 16)}<span>You have <b>${pts(me.points)}</b>. ${pts(min - me.points)} more and you can start using them.</span></div>`);
      return;
    }
    // Room left after any other credit (e.g. a gift card), so the line shows what is really taken off.
    const others = q.credits.filter((c) => c.key !== "points").reduce((s, c) => s + c.amount, 0);
    const want = Math.min(me.points, Math.max(0, q.totalBeforeCredits - others));
    // Keep an applied credit in step with the bag, so the total shown is the total charged.
    if (cur && cur.amount !== want) { setCredit("points", want > 0 ? pointsCredit(want) : null); return setTimeout(() => data.refresh?.(), 0); }
    if (want <= 0) return;
    const box = mount(el, `<label class="ac-redeem ${cur ? "on" : ""}"><span class="ac-redeem-ic">${icon("gem", "", 18)}</span>
      <span class="ac-redeem-t"><b>Use my ${pts(want)}</b><small>${rs(want)} off${want < me.points ? ` · ${n(me.points - want)} left after this order` : ""}</small></span>
      <input type="checkbox" role="switch" ${cur ? "checked" : ""} aria-label="Use my Aarzu Rewards points"><span class="ac-switch" aria-hidden="true"></span></label>`);
    $("input", box).onchange = (e) => {
      setCredit("points", e.target.checked ? pointsCredit(want) : null);
      if (e.target.checked) toast(`${rs(want)} off with your points ✨`, { icon: "gem", ms: 2400 });
      data.refresh?.();
    };
  };
  if (loaded) draw(); else getMe().then(draw);
});

registerSlot("success-extras", (el, data) => {
  const id = data.order;
  const last = lastOrder(id);
  // The order may have used points and is now linked to the account: refresh the cached profile.
  refresh().then(() => {
    if (!el.isConnected) return;
    if (me) {
      const o = me.orders.find((x) => x.id === id);
      const e = o ? o.points : last ? earnFor(last.total, me.tier.multiplier) : 0;
      mount(el, `<div class="ac-success in" data-reveal="zoom"><span class="ac-success-ic">${icon(TIER_ICON[me.tier.key] || "gem", "", 26)}</span><div class="ac-success-t">
        <b>${e ? `You'll earn ${pts(e)} when this order is delivered` : "This order is saved in your account"}</b>
        <small>${o?.usedPoints ? `You used ${pts(o.usedPoints)} on it. ` : ""}Your balance is ${pts(me.points)}.</small></div><a class="btn ghost sm" href="/account" data-link>My account</a></div>`);
    } else {
      const e = last ? earnFor(last.total) : 0;
      const phone = last?.customer?.phone;
      mount(el, `<div class="ac-success out" data-reveal="zoom"><span class="ac-success-ic">${icon("gift", "", 26)}</span><div class="ac-success-t">
        <b>${e ? `Collect ${pts(e)} for this order` : "Collect points for this order"}</b>
        <small>Create a free account${phone ? ` with <b>${esc(phone)}</b>, the number you ordered with,` : " with the number you ordered with"} and we'll add this order to it, plus ${n((program || DEFAULT_PROGRAM).welcome)} welcome points.</small></div>
        <div class="ac-success-ctas"><a class="btn rani sm" href="/account?claim=${encodeURIComponent(id)}&mode=register" data-link>Create account</a><a class="btn ghost sm" href="/account?claim=${encodeURIComponent(id)}&mode=login" data-link>I have one</a></div></div>`);
    }
    reveal(el);
  });
});

// ------------------------------------------------------------------ admin
function adminTab(el, call) {
  return call("/api/admin/accounts").then((list) => {
    const totals = { members: list.length, points: list.reduce((s, a) => s + a.points, 0), redeemed: list.reduce((s, a) => s + a.redeemed, 0), buyers: list.filter((a) => a.orders).length };
    el.innerHTML = `<div class="kpis ac-kpis">${[["Members", n(totals.members)], ["Points outstanding", `${n(totals.points)}<small> = ${rs(totals.points)}</small>`], ["Points redeemed", n(totals.redeemed)], ["Members who ordered", n(totals.buyers)]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="ac-adm-bar"><input type="search" placeholder="Search name, phone or email" aria-label="Search customers"><span class="ac-fine" id="ac-adm-n"></span></div>
      <div class="ac-adm-scroll"><table><thead><tr><th>Customer</th><th>Tier</th><th>Points</th><th>Orders</th><th>Spend</th><th>Joined</th><th></th></tr></thead><tbody id="ac-adm-rows"></tbody></table></div>`;
    const rows = $("#ac-adm-rows", el);
    const draw = (q = "") => {
      const t = q.trim().toLowerCase().replace(/^0/, "");
      const hits = list.filter((a) => !t || [a.name, a.phone, a.email].join(" ").toLowerCase().includes(t));
      $("#ac-adm-n", el).textContent = `${hits.length} of ${list.length}`;
      rows.innerHTML = hits.map((a) => `<tr data-id="${esc(a.id)}">
        <td><b>${esc(a.name)}</b><br><small>+${esc(a.phone)}${a.email ? ` · ${esc(a.email)}` : ""}</small></td>
        <td><span class="ac-badge sm ac-${esc(a.tier.toLowerCase())}">${esc(a.tier)}</span></td>
        <td><b data-bal>${n(a.points)}</b><br><small>${n(a.lifetimePoints)} lifetime · ${n(a.redeemed)} used</small></td>
        <td>${a.orders}${a.delivered ? ` <small>(${a.delivered} delivered)</small>` : ""}${a.phoneOrders > a.orders ? `<br><small>${a.phoneOrders} with this phone</small>` : ""}</td>
        <td>${rs(a.spend)}</td>
        <td><small>${date(a.createdAt)}${a.lastLoginAt ? `<br>last in ${date(a.lastLoginAt, { day: "numeric", month: "short" })}` : ""}</small></td>
        <td><details class="ac-adm-act"><summary>Manage</summary><form data-adjust><input name="delta" type="number" step="1" placeholder="± points" aria-label="Points to add or remove" required><input name="note" maxlength="120" placeholder="Reason (shown to the customer)" aria-label="Reason"><button class="btn sm rani">Apply</button></form><button type="button" class="btn sm ghost" data-reset>Reset password</button><div class="ac-temp" hidden></div></details></td></tr>`).join("") || `<tr><td colspan="7">${list.length ? "No customers match." : "No customer accounts yet."}</td></tr>`;
    };
    $("input[type=search]", el).oninput = (e) => draw(e.target.value);
    el.onsubmit = async (e) => {
      const f = e.target.closest("[data-adjust]");
      if (!f) return;
      e.preventDefault();
      const tr = f.closest("tr"), a = list.find((x) => x.id === tr.dataset.id);
      try {
        const r = await call(`/api/admin/accounts/${a.id}/points`, { delta: Number(f.delta.value), note: f.note.value });
        a.points = r.points;
        $("[data-bal]", tr).textContent = n(r.points);
        f.reset();
        toast(`${esc(a.name)} now has ${pts(r.points)}`, { icon: "gem" });
      } catch (err) { toast(esc(err.message), { icon: "x" }); }
    };
    el.onclick = async (e) => {
      const b = e.target.closest("[data-reset]");
      if (!b) return;
      const tr = b.closest("tr"), a = list.find((x) => x.id === tr.dataset.id);
      if (!b.classList.contains("sure")) { b.classList.add("sure"); b.textContent = "Tap to confirm"; return; }
      try {
        const r = await call(`/api/admin/accounts/${a.id}/password`, {});
        const box = $(".ac-temp", tr);
        const msg = `Assalam o Alaikum ${first(a.name)}! Your temporary Aarzu password is ${r.temp}. Please sign in and change it under My account → Profile.`;
        box.hidden = false;
        box.innerHTML = `Temporary password: <code>${esc(r.temp)}</code><a class="btn sm wa" href="https://wa.me/${esc(a.phone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon("whatsapp", "", 15)} Send on WhatsApp</a>`;
        b.remove();
      } catch (err) { toast(esc(err.message), { icon: "x" }); }
    };
    draw();
  });
}

// ------------------------------------------------------------------ init
export async function init() {
  registerHeaderTool(() => `<a class="icon-btn ac-tool ${me ? "in" : ""}" id="ac-tool" href="/account" data-link aria-label="${me ? `My account (${esc(me.name)})` : "Sign in or create an account"}">${toolInner()}</a>`);
  registerRoute(/^\/account\/?$/, accountPage);
  registerRoute(/^\/rewards\/?$/, rewardsPage);
  registerLink({ where: "aarzu", label: "Aarzu Rewards", href: "/rewards" });
  registerLink({ where: "menu", label: "My account", href: "/account" });
  registerAdminTab({ key: "customers", label: "Customers", render: adminTab });
  // Don't hold up the first paint: the header icon updates itself when the profile arrives.
  refresh();
}
