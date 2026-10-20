// Aarzu admin tools. Server side: lib/routes/adminpro.mjs.
//   admin "Insights"   sales for 7 / 30 / 90 days or all time: revenue, orders, payment mix,
//                      refusals, revenue by day (hand-made SVG), top products, cities, coupons, customers
//   admin "Coupons"    create, edit and switch off discount codes (db "coupons"); store.json codes read-only
//   admin "Exports"    orders.csv, courier booking sheet, packing slips for confirmed orders
//   /admin/invoice/<id>         printable invoice / packing slip (A4 or A5)
//   /admin/invoice/confirmed    one slip per confirmed order, ready to print in one go
import { $, $$, esc, rs, icon, api, state, toast, registerRoute, registerAdminTab } from "../core.js";

// A few extra line icons (lucide, ISC licence) that the shared icon set doesn't have
const PATHS = {
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
};
const ic = (name, size = 16) => (PATHS[name] ? `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>` : icon(name, "", size));

const PAY = { cod: "Cash on delivery", bank: "Bank transfer", wallet: "JazzCash / Easypaisa" };
const PAY_COLOR = { cod: "#D6246E", bank: "#3D53AE", wallet: "#0A9396" }; // checked for colour-blind separation
const STATUSES = ["placed", "confirmed", "dispatched", "delivered", "cancelled", "returned"];
const PKT = "Asia/Karachi";

const remember = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };
const pw = () => { if (state.adminPassword) return state.adminPassword; try { return sessionStorage.getItem("az_admin") || ""; } catch { return ""; } };
const authFetch = (path, opts = {}) => fetch(path, { ...opts, headers: { Authorization: `Bearer ${pw()}`, "X-Aarzu-Admin": pw(), ...(opts.headers || {}) } });
async function send(path, body, method) {
  return api(path, body, method, { Authorization: `Bearer ${pw()}`, "X-Aarzu-Admin": pw() });
}

const pct = (n) => (n == null ? "–" : `${n}%`);
const num = (n) => Math.round(n || 0).toLocaleString("en-PK");
const plural = (n, one, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
const keyDate = (k, opts) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const pktDate = (iso, opts = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) => new Date(iso).toLocaleString("en-GB", { timeZone: PKT, ...opts });
const compact = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : String(Math.round(n)));
const localPhone = (p) => { const s = String(p || ""); return /^92\d{10}$/.test(s) ? `0${s.slice(2, 5)} ${s.slice(5)}` : s; };
const empty = (ur, title, text, extra = "") => `<div class="empty-state ap-empty"><div class="ur">${ur}</div><h3>${title}</h3><p>${text}</p>${extra}</div>`;

// ================================================================== Insights
const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]];
let range = RANGES.some(([k]) => k === remember("ap_range")) ? remember("ap_range") : "30";

async function insightsTab(el, call) {
  el.innerHTML = `<div class="ap">
    <div class="ap-head"><div><h3>Insights <span class="ur">کاروبار</span></h3><p id="ap-period">Sales from real orders. Days are Pakistan time.</p></div>
      <div class="ap-range" role="group" aria-label="Period">${RANGES.map(([k, l]) => `<button class="chip" data-ap-range="${k}" aria-pressed="false">${l}</button>`).join("")}</div></div>
    <div id="ap-ins" aria-live="polite"><p class="ap-muted">Loading…</p></div></div>`;
  const body = $("#ap-ins", el);
  const load = async () => {
    $$("[data-ap-range]", el).forEach((b) => { b.classList.toggle("on", b.dataset.apRange === range); b.setAttribute("aria-pressed", String(b.dataset.apRange === range)); });
    body.classList.add("ap-loading");
    try {
      const d = await call(`/api/admin/insights?days=${range}`);
      $("#ap-period", el).textContent = d.days ? `Last ${d.days} days: ${keyDate(d.from, { day: "numeric", month: "short" })} – ${keyDate(d.to, { day: "numeric", month: "short", year: "numeric" })} (Pakistan time)` : "All time, from the first order to today (Pakistan time)";
      body.innerHTML = insightsHtml(d);
      const ch = $("[data-ap-chart]", body);
      if (ch) barChart(ch, d.series, d.bucket);
    } catch (e) {
      body.innerHTML = `<p class="ap-error">${esc(e.message)}</p>`;
    } finally { body.classList.remove("ap-loading"); }
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ap-range]");
    if (!b || b.dataset.apRange === range) return;
    range = b.dataset.apRange;
    remember("ap_range", range);
    load();
  });
  await load();
}

function insightsHtml(d) {
  if (!d.totalOrdersEver) return empty("آغاز", "No orders yet", "Your numbers appear here as soon as the first order comes in.");
  if (!d.orders.placed) return empty("خاموش", `No orders in the last ${d.days} days`, "Pick a longer period to see earlier orders.", `<button class="btn ghost sm" data-ap-range="all">See all time</button>`);
  const o = d.orders, st = o.byStatus;
  const kpis = [
    [rs(d.revenue), "Revenue", `Leaves out cancelled and returned orders. Includes delivery. ${rs(d.deliveredRevenue)} from delivered orders.`],
    [num(o.placed), "Orders placed", `${num(o.kept)} kept · ${num(st.cancelled)} cancelled · ${num(st.returned)} returned`],
    [o.kept ? rs(d.aov) : "–", "Average order", "Revenue ÷ kept orders"],
    [num(d.items), "Items sold", "Pieces in kept orders"],
  ];
  const label = d.bucket === "week" ? "week" : "day";
  const busy = d.series.filter((s) => s.orders || s.dropped).slice().reverse();
  return `
  <div class="ap-kpis">${kpis.map(([v, l, h]) => `<div class="kpi"><b>${v}</b><span>${l}</span><small>${h}</small></div>`).join("")}</div>

  <section class="ap-card ap-wide">
    <div class="ap-card-head"><h4>Revenue by ${label}</h4><small>Kept orders only. Hover or tap a bar for details.</small></div>
    <div class="ap-chart" data-ap-chart></div>
    <details class="ap-more"><summary>Show the numbers</summary>
      ${busy.length ? `<div class="ap-scroll"><table><tr><th>${d.bucket === "week" ? "Week of" : "Date"}</th><th>Revenue</th><th>Kept orders</th><th>Cancelled / returned</th></tr>${busy.map((s) => `<tr><td>${esc(keyDate(s.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }))}</td><td>${rs(s.revenue)}</td><td>${num(s.orders)}</td><td>${num(s.dropped)}</td></tr>`).join("")}</table></div>` : `<p class="ap-muted">No orders on any ${label} in this period.</p>`}
    </details>
  </section>

  <div class="ap-grid">
    ${paymentCard(d)}
    ${refusalCard(d)}
    ${productsCard(d)}
    ${citiesCard(d)}
    ${couponsCard(d)}
    ${customersCard(d)}
  </div>`;
}

const legendRow = (color, name, big, small) => `<li><i style="background:${color}"></i><span>${name}</span><b>${big}</b>${small ? `<small>${small}</small>` : ""}</li>`;
const stack = (parts, label) => `<div class="ap-stack" role="img" aria-label="${esc(label)}">${parts.filter((p) => p.n > 0).map((p) => `<span style="flex:${p.n};background:${p.color}" title="${esc(p.title)}"></span>`).join("")}</div>`;

function paymentCard(d) {
  const cod = d.payment.find((p) => p.key === "cod");
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>Cash on delivery vs prepaid</h4><small>Share of the ${plural(d.orders.placed, "order")} placed</small></div>
    ${stack(d.payment.map((p) => ({ n: p.orders, color: PAY_COLOR[p.key], title: `${p.label}: ${p.orders} orders (${pct(p.share)})` })), d.payment.map((p) => `${p.label} ${pct(p.share)}`).join(", "))}
    <ul class="ap-legend">${d.payment.map((p) => legendRow(PAY_COLOR[p.key], esc(p.label), pct(p.share ?? 0), `${plural(p.orders, "order")} · ${rs(p.revenue)} revenue`)).join("")}</ul>
    <p class="ap-note"><b>Prepaid</b> (bank + wallet): ${pct(d.prepaid.share ?? 0)} of orders.
    ${cod.refusal.rate != null ? `Cash-on-delivery refusals: <b>${pct(cod.refusal.rate)}</b> (${cod.refusal.returned} of ${cod.refusal.delivered + cod.refusal.returned} finished).` : "No cash-on-delivery order has been delivered or returned yet in this period."}</p>
  </section>`;
}

function refusalCard(d) {
  const r = d.refusal, done = r.delivered + r.returned, st = d.orders.byStatus;
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>Refusals & returns</h4><small>Returned ÷ (delivered + returned)</small></div>
    <div class="ap-big ${r.rate >= 20 ? "warn" : ""}"><b>${pct(r.rate)}</b><span>${done ? `${plural(r.returned, "order")} returned or refused out of ${num(done)} that finished delivery` : "No order in this period has been delivered or returned yet."}</span></div>
    <p class="ap-note">Cancelled before dispatch: <b>${pct(d.cancelRate)}</b> (${plural(st.cancelled, "order")}).</p>
    <div class="ap-statuses">${STATUSES.filter((s) => st[s]).map((s) => `<span class="status ${s}">${s} ${num(st[s])}</span>`).join("")}</div>
  </section>`;
}

function productsCard(d) {
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>Top products</h4><small>By pieces sold in kept orders</small></div>
    ${d.topProducts.length ? `<div class="ap-scroll"><table class="ap-table"><tr><th>#</th><th>Product</th><th class="n">Sold</th><th class="n">Sales</th></tr>
      ${d.topProducts.map((p, i) => `<tr><td class="rank">${i + 1}</td><td><b>${esc(p.title)}</b><small>${esc(p.id)} · ${plural(p.orders, "order")}</small></td><td class="n">${num(p.qty)}</td><td class="n">${rs(p.sales)}</td></tr>`).join("")}</table></div>
      <p class="ap-foot">Sales = item prices with add-ons, before order discounts.</p>` : `<p class="ap-muted">Nothing sold in kept orders yet.</p>`}
  </section>`;
}

function citiesCard(d) {
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>Top cities</h4><small>${d.cityCount > d.cities.length ? `Top ${d.cities.length} of ${d.cityCount} cities` : `${plural(d.cityCount, "city", "cities")}`} by orders placed</small></div>
    <div class="ap-scroll"><table class="ap-table"><tr><th>City</th><th class="n">Orders</th><th class="n">Revenue</th><th class="n">Refusal</th></tr>
      ${d.cities.map((c) => { const done = c.delivered + c.returned; return `<tr><td><b>${esc(c.city)}</b>${c.cancelled ? `<small>${c.cancelled} cancelled</small>` : ""}</td><td class="n">${num(c.orders)}</td><td class="n">${rs(c.revenue)}</td><td class="n">${c.rate == null ? `<span class="ap-dim" title="No delivered or returned orders yet">–</span>` : `<span class="${c.rate >= 20 && done >= 3 ? "ap-warn" : ""}">${c.rate >= 20 && done >= 3 ? "⚠ " : ""}${pct(c.rate)}</span><small>${c.returned} of ${done}</small>`}</td></tr>`; }).join("")}</table></div>
    <p class="ap-foot">Refusal = returned ÷ (delivered + returned) in that city. Revenue leaves out cancelled and returned orders.</p>
  </section>`;
}

function couponsCard(d) {
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>Coupon usage</h4><small>Orders that weren't cancelled</small></div>
    ${d.coupons.length ? `<div class="ap-scroll"><table class="ap-table"><tr><th>Code</th><th class="n">Uses</th><th class="n">Discount</th><th class="n">Order totals</th></tr>
      ${d.coupons.map((c) => `<tr><td><code class="ap-code">${esc(c.code)}</code></td><td class="n">${num(c.uses)}</td><td class="n">${c.discount ? rs(c.discount) : ""}${c.freeDelivery ? `<small>${c.discount ? "+ " : ""}${plural(c.freeDelivery, "free delivery", "free deliveries")}</small>` : ""}</td><td class="n">${rs(c.total)}</td></tr>`).join("")}</table></div>
      <p class="ap-foot">${pct(Math.round((d.coupons.reduce((s, c) => s + c.uses, 0) / Math.max(1, d.customers.orders)) * 1000) / 10)} of these orders used a code.</p>` : `<p class="ap-muted">No discount codes were used in this period.</p>`}
  </section>`;
}

function customersCard(d) {
  const c = d.customers;
  if (!c.total) return `<section class="ap-card"><div class="ap-card-head"><h4>New vs returning customers</h4></div><p class="ap-muted">Every order in this period was cancelled.</p></section>`;
  const allTime = !d.days;
  const parts = allTime
    ? [{ n: c.total - c.cameBack, color: "#D6246E", title: `One order: ${c.total - c.cameBack}` }, { n: c.cameBack, color: "#3D53AE", title: `Ordered again: ${c.cameBack}` }]
    : [{ n: c.new, color: "#D6246E", title: `New: ${c.new}` }, { n: c.returning, color: "#3D53AE", title: `Returning: ${c.returning}` }];
  return `<section class="ap-card">
    <div class="ap-card-head"><h4>New vs returning customers</h4><small>By phone number · cancelled orders left out</small></div>
    <div class="ap-big"><b>${num(c.total)}</b><span>${c.total === 1 ? "customer" : "customers"} ordered in this period</span></div>
    ${stack(parts, parts.map((p) => p.title).join(", "))}
    <ul class="ap-legend">${allTime
      ? legendRow("#D6246E", "Ordered once", num(c.total - c.cameBack)) + legendRow("#3D53AE", "Ordered more than once", num(c.cameBack), `${pct(Math.round((c.cameBack / c.total) * 1000) / 10)} of customers`)
      : legendRow("#D6246E", "New", num(c.new), `First order in this period${c.cameBack ? ` · ${c.cameBack} already ordered again` : ""}`) + legendRow("#3D53AE", "Returning", num(c.returning), "Ordered before this period")}</ul>
    <p class="ap-note"><b>${pct(c.repeatShare)}</b> of orders (${num(c.repeatOrders)} of ${num(c.orders)}) came from people who had ordered before.</p>
  </section>`;
}

// ------------------------------------------------------------------ SVG bar chart (no libraries)
// Drawn at the real pixel width so text stays crisp; redrawn when the card is resized.
function niceStep(x) {
  if (!(x > 0)) return 1000;
  const p = 10 ** Math.floor(Math.log10(x)), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

function barChart(host, series, bucket) {
  if (!series.length) { host.innerHTML = `<p class="ap-muted">No data.</p>`; return; }
  let width = 0;
  const H = 230, L = 46, R = 10, T = 26, B = 28;
  const max = Math.max(0, ...series.map((s) => s.revenue));
  const step = max ? niceStep(max / 4) : 1000;
  const top = max ? Math.ceil(max / step) * step : 4000;
  const peak = max ? series.findIndex((s) => s.revenue === max) : -1;
  const day = (k) => keyDate(k, bucket === "week" ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short" });

  const draw = () => {
    const w = Math.max(240, Math.round(host.clientWidth));
    if (w === width) return;
    width = w;
    const pw = w - L - R, ph = H - T - B, n = series.length, band = pw / n;
    const bw = Math.max(1, Math.min(24, band - 2));
    const y = (v) => T + ph - (v / top) * ph;
    const grid = [];
    for (let v = 0; v <= top + 1e-9; v += step) grid.push(`<line x1="${L}" x2="${w - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="${v ? "g" : "base"}"/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" class="t">${v ? compact(v) : "0"}</text>`);
    const bars = series.map((s, i) => {
      const x = L + band * i + (band - bw) / 2, h = (s.revenue / top) * ph;
      if (!(h > 0)) return "";
      const r = Math.min(4, bw / 2, h), y0 = T + ph, y1 = y0 - h;
      return `<path class="bar" data-bar="${i}" d="M${x.toFixed(2)} ${y0}V${(y1 + r).toFixed(2)}Q${x.toFixed(2)} ${y1.toFixed(2)} ${(x + r).toFixed(2)} ${y1.toFixed(2)}H${(x + bw - r).toFixed(2)}Q${(x + bw).toFixed(2)} ${y1.toFixed(2)} ${(x + bw).toFixed(2)} ${(y1 + r).toFixed(2)}V${y0}Z"/>`;
    }).join("");
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / 74))));
    const xs = series.map((s, i) => {
      if ((n - 1 - i) % every) return "";
      const cx = L + band * (i + 0.5);
      const anchor = cx < L + 26 ? "start" : cx > w - R - 26 ? "end" : "middle";
      return `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}" class="t">${esc(keyDate(s.date, { day: "numeric", month: "short" }))}</text>`;
    }).join("");
    let peakLabel = "";
    if (peak >= 0) {
      const cx = L + band * (peak + 0.5);
      const anchor = cx < L + 30 ? "start" : cx > w - R - 30 ? "end" : "middle";
      peakLabel = `<text x="${cx.toFixed(1)}" y="${(y(max) - 8).toFixed(1)}" text-anchor="${anchor}" class="t peak">${esc(rs(max))}</text>`;
    }
    const hits = series.map((s, i) => `<rect class="hit" data-i="${i}" x="${(L + band * i).toFixed(2)}" y="${T}" width="${band.toFixed(2)}" height="${ph}"/>`).join("");
    host.innerHTML = `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img" aria-label="Revenue by ${bucket}: highest ${esc(rs(max))}">${grid.join("")}${bars}${peakLabel}${xs}${hits}</svg><div class="ap-tip" hidden></div>`;
  };

  let shown = -1;
  const tipAt = (i) => {
    const tip = $(".ap-tip", host);
    if (i === shown || !tip) return;
    $$(".bar.on", host).forEach((b) => b.classList.remove("on"));
    shown = i;
    if (i < 0) { tip.hidden = true; return; }
    const s = series[i];
    $(`[data-bar="${i}"]`, host)?.classList.add("on");
    tip.innerHTML = `<b>${esc(bucket === "week" ? `Week of ${day(s.date)}` : day(s.date))}</b><span>${esc(rs(s.revenue))}</span><small>${plural(s.orders, "kept order")}${s.dropped ? ` · ${s.dropped} cancelled/returned` : ""}</small>`;
    tip.hidden = false;
    const pw = width - L - R, band = pw / series.length, cx = L + band * (i + 0.5);
    const h = (s.revenue / top) * (H - T - B);
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(width - tw / 2 - 2, Math.max(tw / 2 + 2, cx))}px`;
    tip.style.top = `${Math.max(0, H - B - h - 10)}px`;
  };
  host.addEventListener("pointermove", (e) => { const r = e.target.closest?.("[data-i]"); tipAt(r ? Number(r.dataset.i) : -1); });
  host.addEventListener("pointerdown", (e) => { const r = e.target.closest?.("[data-i]"); if (r) tipAt(Number(r.dataset.i)); });
  host.addEventListener("pointerleave", () => tipAt(-1));
  draw();
  const ro = new ResizeObserver(() => { if (!host.isConnected) return ro.disconnect(); shown = -1; draw(); });
  ro.observe(host);
}

// ================================================================== Coupons
const TYPE_LABEL = { percent: "Percent off", fixed: "Rupees off", freeship: "Free delivery" };
const STATE = { active: ["Active", "ok"], disabled: ["Switched off", "muted"], expired: ["Expired", "muted"], "used-up": ["Used up", "warn"] };
const autoLabel = (c) => (c.type === "percent" ? (c.value ? `${c.value}% off` : "") : c.type === "fixed" ? (c.value ? `${rs(c.value)} off` : "") : "Free delivery");
const offer = (c) => [c.type === "freeship" ? "Free delivery" : c.type === "percent" ? `${c.value}% off` : `${rs(c.value)} off`, c.minSubtotal ? `min. spend ${rs(c.minSubtotal)}` : "", c.firstOrderOnly ? "first order only" : ""].filter(Boolean).join(" · ");
const expiry = (c) => (c.expiresOn ? keyDate(c.expiresOn, { day: "numeric", month: "short", year: "numeric" }) : "No expiry");

async function couponsTab(el, call) {
  el.innerHTML = `<div class="ap"><p class="ap-muted">Loading codes…</p></div>`;
  let data = await call("/api/admin/coupons");
  let editing = null;
  el.innerHTML = `<div class="ap">
    <div class="ap-head"><div><h3>Coupon codes <span class="ur">رعایت</span></h3><p>New codes work at checkout straight away. Uses count orders that weren't cancelled.</p></div></div>
    <div class="ap-cp">
      <form class="ap-card ap-form" id="ap-cf" novalidate></form>
      <div class="ap-cp-lists"><section class="ap-card" id="ap-cl"></section><section class="ap-card" id="ap-sl"></section></div>
    </div></div>`;
  const form = $("#ap-cf", el);
  const F = (n) => form.elements.namedItem(n);

  const drawForm = (c = null) => {
    editing = c?.code || null;
    const v = c || { type: "percent", firstOrderOnly: false };
    form.innerHTML = `
      <div class="ap-card-head"><h4>${editing ? `Edit <code class="ap-code">${esc(editing)}</code>` : "New code"}</h4><small>${editing ? "The code itself can't change, because past orders use it." : "Shoppers type this at checkout."}</small></div>
      ${editing ? "" : `<div class="field" data-k="code"><label for="ap-code">Code</label><input id="ap-code" name="code" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. EID2026" required><span class="hint">3–20 letters and numbers, no spaces.</span><span class="msg"></span></div>`}
      <div class="field" data-k="type"><label>Type</label><div class="ap-seg" role="radiogroup" aria-label="Type">${Object.entries(TYPE_LABEL).map(([k, l]) => `<label><input type="radio" name="type" value="${k}" ${v.type === k ? "checked" : ""}><span>${l}</span></label>`).join("")}</div><span class="msg"></span></div>
      <div class="row2">
        <div class="field" data-k="value" data-ap-val><label for="ap-val"></label><input id="ap-val" name="value" type="number" inputmode="numeric" min="1" step="1" value="${esc(v.value ?? "")}"><span class="msg"></span></div>
        <div class="field" data-k="minSubtotal" data-ap-min><label for="ap-min">Min. spend (Rs)</label><input id="ap-min" name="minSubtotal" type="number" inputmode="numeric" min="0" step="1" placeholder="None" value="${esc(v.minSubtotal ?? "")}"><span class="hint">Counted after multi-buy and bundle savings.</span><span class="msg"></span></div>
      </div>
      <p class="ap-note" data-ap-freenote hidden>Free delivery codes work on any order, so they have no minimum spend.</p>
      <div class="row2">
        <div class="field" data-k="expiresOn"><label for="ap-exp">Last day (optional)</label><input id="ap-exp" name="expiresOn" type="date" value="${esc(v.expiresOn ?? "")}"><span class="hint">Works until 11:59 pm Pakistan time.</span><span class="msg"></span></div>
        <div class="field" data-k="maxUses"><label for="ap-max">Max uses (optional)</label><input id="ap-max" name="maxUses" type="number" inputmode="numeric" min="1" step="1" placeholder="No limit" value="${esc(v.maxUses ?? "")}"><span class="msg"></span></div>
      </div>
      <label class="check ap-check"><input type="checkbox" name="firstOrderOnly" ${v.firstOrderOnly ? "checked" : ""}><span><b>First order only</b><small>Checked against the shopper's phone number when they order.</small></span></label>
      <div class="field" data-k="label"><label for="ap-lbl">Name in the bag (optional)</label><input id="ap-lbl" name="label" maxlength="60" value="${esc(c?.label && c.label !== autoLabel(c) ? c.label : "")}"><span class="msg"></span></div>
      <div class="ap-form-actions"><button class="btn rani" id="ap-save">${editing ? "Save changes" : "Create code"}</button>${editing ? `<button type="button" class="btn ghost" data-ap-cancel>Cancel</button>` : ""}</div>`;
    syncForm();
  };
  const syncForm = () => {
    const type = F("type").value;
    const val = $("[data-ap-val]", form);
    val.hidden = type === "freeship";
    $("label", val).textContent = type === "fixed" ? "Rupees off" : "Percent off (1–90)";
    F("value").max = type === "fixed" ? "50000" : "90";
    $("[data-ap-min]", form).hidden = type === "freeship";
    $("[data-ap-freenote]", form).hidden = type !== "freeship";
    F("label").placeholder = autoLabel({ type, value: Number(F("value").value) || 0 }) || "e.g. Eid special";
  };
  const fieldErr = (k, msg) => {
    $$(".field", form).forEach((f) => { f.classList.remove("err"); const m = $(".msg", f); if (m) m.textContent = ""; });
    const f = k && $(`[data-k="${k}"]`, form);
    if (f && !f.hidden) { f.classList.add("err"); $(".msg", f).textContent = msg; $("input", f)?.focus(); } else toast(esc(msg), { icon: "x" });
  };

  const drawLists = () => {
    const codes = data.codes;
    $("#ap-cl", el).innerHTML = `<div class="ap-card-head"><h4>Your codes</h4><small>${codes.length ? `${codes.filter((c) => c.state === "active").length} active` : "Saved in the store's database"}</small></div>
      ${codes.length ? `<div class="ap-scroll"><table class="ap-table ap-codes"><tr><th>Code</th><th>Offer</th><th class="n">Uses</th><th>Last day</th><th>Status</th><th></th></tr>
        ${codes.map((c) => { const [l, tone] = STATE[c.state] || [c.state, "muted"]; return `<tr>
          <td><code class="ap-code">${esc(c.code)}</code><small>${esc(c.label)}</small></td>
          <td>${esc(offer(c))}</td>
          <td class="n"><b>${num(c.uses)}</b>${c.maxUses ? `<small>of ${num(c.maxUses)}</small>` : ""}</td>
          <td>${esc(expiry(c))}</td>
          <td><span class="ap-pill ${tone}">${l}</span></td>
          <td><div class="ap-row-actions"><button class="btn ghost sm" data-ap-edit="${esc(c.code)}">${ic("pencil", 13)} Edit</button><button class="btn ${c.active ? "ghost" : "rani"} sm" data-ap-toggle="${esc(c.code)}">${c.active ? "Switch off" : "Switch on"}</button></div></td></tr>`; }).join("")}</table></div>`
        : `<div class="ap-empty-sm"><span class="ur">کوڈ</span><p>No codes yet. Create one with the form, for example a 10% Eid code with a last day.</p></div>`}`;
    $("#ap-sl", el).innerHTML = `<div class="ap-card-head"><h4>Built-in codes</h4><small>Read-only: edit in <code>data/store.json</code></small></div>
      ${data.storeCodes.length ? `<div class="ap-scroll"><table class="ap-table"><tr><th>Code</th><th>Offer</th><th class="n">Uses</th><th>Note</th></tr>
        ${data.storeCodes.map((c) => `<tr><td><code class="ap-code">${esc(c.code)}</code><small>${esc(c.label)}</small></td><td>${esc(offer(c))}</td><td class="n">${num(c.uses)}</td><td><small>${c.endsAt ? (c.ended ? "Launch offer ended" : `Launch offer until ${esc(pktDate(c.endsAt, { day: "numeric", month: "short", year: "numeric" }))}`) : "Always on"}</small></td></tr>`).join("")}</table></div>` : `<p class="ap-muted">No codes in data/store.json.</p>`}`;
  };

  const reload = async () => { data = await call("/api/admin/coupons"); drawLists(); };
  drawForm();
  drawLists();

  form.addEventListener("change", (e) => { if (e.target.name === "type") { syncForm(); fieldErr(null); } });
  form.addEventListener("input", (e) => {
    if (e.target.name === "code") { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); try { e.target.setSelectionRange(p, p); } catch {} }
    if (e.target.name === "value") syncForm();
    const f = e.target.closest(".field.err");
    if (f) { f.classList.remove("err"); $(".msg", f).textContent = ""; }
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const type = F("type").value;
    const body = {
      type,
      value: type === "freeship" ? null : F("value").value,
      minSubtotal: type === "freeship" ? null : F("minSubtotal").value,
      expiresOn: F("expiresOn").value,
      maxUses: F("maxUses").value,
      firstOrderOnly: F("firstOrderOnly").checked,
      label: F("label").value.trim(),
    };
    for (const k of ["value", "minSubtotal", "maxUses"]) if (body[k] !== null && body[k] !== "") body[k] = Number(body[k]);
    if (!editing) body.code = F("code").value.trim();
    const btn = $("#ap-save", form);
    btn.disabled = true;
    try {
      const c = editing ? await send(`/api/admin/coupons/${encodeURIComponent(editing)}`, body, "PATCH") : await send("/api/admin/coupons", body);
      toast(editing ? `${esc(c.code)} saved` : `${esc(c.code)} is live at checkout`, { icon: "badge-percent" });
      drawForm();
      await reload();
    } catch (err) {
      btn.disabled = false;
      fieldErr(err.data?.field, err.message);
    }
  };
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-ap-cancel]")) { drawForm(); return; }
    const ed = e.target.closest("[data-ap-edit]");
    if (ed) {
      drawForm(data.codes.find((c) => c.code === ed.dataset.apEdit));
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const tg = e.target.closest("[data-ap-toggle]");
    if (tg) {
      const c = data.codes.find((x) => x.code === tg.dataset.apToggle);
      tg.disabled = true;
      try {
        await send(`/api/admin/coupons/${encodeURIComponent(c.code)}`, { active: !c.active }, "PATCH");
        toast(c.active ? `${esc(c.code)} switched off. Shoppers can't use it now.` : `${esc(c.code)} switched on`);
        await reload();
      } catch (err) { tg.disabled = false; toast(esc(err.message), { icon: "x" }); }
    }
  });
}

// ================================================================== Exports
async function download(path, fallback) {
  const r = await authFetch(path);
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Download failed"); }
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1] || fallback;
  const rows = Math.max(0, (await blob.text()).split("\r\n").filter(Boolean).length - 1);
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return rows;
}

async function exportsTab(el, call) {
  const s = await call("/api/admin/summary");
  const ready = s.confirmedToBook ?? 0;
  el.innerHTML = `<div class="ap">
    <div class="ap-head"><div><h3>Exports & packing slips</h3><p>Spreadsheets open in Excel or Google Sheets, with Urdu shown correctly.</p></div></div>
    <div class="ap-ex">
      <section class="ap-card ap-ex-card">
        <span class="ap-ex-ic">${ic("file", 22)}</span>
        <div class="ap-card-head"><h4>Orders spreadsheet</h4><small>One row per order, oldest first</small></div>
        <div class="row2">
          <div class="field"><label for="ap-xd">Period</label><select id="ap-xd">${RANGES.map(([k, l]) => `<option value="${k}" ${k === "30" ? "selected" : ""}>${k === "all" ? l : `Last ${l}`}</option>`).join("")}</select></div>
          <div class="field"><label for="ap-xs">Status</label><select id="ap-xs"><option value="all">All statuses</option>${STATUSES.map((x) => `<option value="${x}">${x[0].toUpperCase() + x.slice(1)}</option>`).join("")}</select></div>
        </div>
        <p class="ap-foot">Columns: id, date, status, customer, phone, email, city, address, items, qty, subtotal, discounts, credits (gift card / points), delivery, total, payment, courier, tracking.</p>
        <button class="btn rani" data-ap-dl="orders">${ic("download", 16)} Download orders.csv</button>
      </section>
      <section class="ap-card ap-ex-card">
        <span class="ap-ex-ic">${icon("truck", "", 22)}</span>
        <div class="ap-card-head"><h4>Courier booking sheet</h4><small>${ready ? `<b>${plural(ready, "confirmed order")}</b> ready to book` : "No confirmed orders to book right now"}</small></div>
        <p class="ap-foot">Consignee, phone, address, city, COD amount (0 when prepaid), item description, pieces and order number. Gift cards are left out, as there's nothing to ship. Upload the file to your courier as it is; if you open it in Excel first, set the phone column to Text so the leading 0 stays.</p>
        <button class="btn rani" data-ap-dl="courier" ${ready ? "" : "disabled"}>${ic("download", 16)} Download courier.csv</button>
      </section>
      <section class="ap-card ap-ex-card">
        <span class="ap-ex-ic">${ic("printer", 22)}</span>
        <div class="ap-card-head"><h4>Packing slips</h4><small>${ready ? `${plural(ready, "slip")} for confirmed orders` : "No confirmed orders right now"}</small></div>
        <p class="ap-foot">Each order prints on its own A4 or A5 page with the amount to collect. For one order, use the Invoice button on the Orders tab.</p>
        <a class="btn ${ready ? "rani" : "ghost"}" href="/admin/invoice/confirmed" target="_blank" rel="opener">${ic("printer", 16)} Print packing slips for all confirmed orders</a>
      </section>
    </div></div>`;
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ap-dl]");
    if (!b) return;
    const orders = b.dataset.apDl === "orders";
    const days = $("#ap-xd", el).value, status = $("#ap-xs", el).value;
    const label = b.innerHTML;
    b.disabled = true;
    b.innerHTML = `<span class="spin"></span> Preparing…`;
    try {
      const n = await download(orders ? `/api/admin/export/orders.csv?days=${encodeURIComponent(days)}&status=${encodeURIComponent(status)}` : "/api/admin/export/courier.csv", orders ? "aarzu-orders.csv" : "aarzu-courier-booking.csv");
      toast(n ? `Downloaded ${plural(n, "order")}` : "Downloaded. There were no orders to include.", { icon: "circle-check" });
    } catch (err) { toast(esc(err.message), { icon: "x" }); }
    finally { b.disabled = false; b.innerHTML = label; }
  });
}

// ================================================================== Invoice / packing slip
const shippable = (o) => (o.items || []).filter((i) => !i.meta?.digital);
const PAPER = ["A4", "A5"];

function invoicePage(view, { params }) {
  const which = String(params[0] || "");
  const bulk = which.toLowerCase() === "confirmed";
  document.body.classList.add("ap-inv-mode");
  let paper = PAPER.includes(remember("ap_paper")) ? remember("ap_paper") : "A4";
  const setPaper = (p) => {
    paper = p;
    remember("ap_paper", p);
    let st = $("#ap-page-size");
    if (!st) { st = Object.assign(document.createElement("style"), { id: "ap-page-size" }); document.head.append(st); }
    st.textContent = `@page { size: ${p}; margin: ${p === "A5" ? "8mm" : "12mm"}; }`;
    $$(".ap-sheet", view).forEach((s) => s.classList.toggle("a5", p === "A5"));
    $$("[data-ap-paper]", view).forEach((b) => { b.classList.toggle("on", b.dataset.apPaper === p); b.setAttribute("aria-pressed", String(b.dataset.apPaper === p)); });
  };

  const login = (msg = "") => {
    view.innerHTML = `<section class="wrap ap-inv-login"><form class="card-box" id="ap-lf">
      <h1>Sign in to print</h1><p>${msg || "Invoices are for the Aarzu team. Use the admin password."}</p>
      <div class="field"><label for="ap-pw">Admin password</label><input type="password" id="ap-pw" name="pw" autocomplete="current-password" autofocus></div>
      <button class="btn rani">Sign in</button><a class="link under" href="/admin" data-link>Go to the admin dashboard</a></form></section>`;
    $("#ap-lf", view).onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget || e.target, button = form.querySelector("button");
      if (button.disabled) return;
      const password = form.elements.namedItem("pw").value;
      button.disabled = true;
      try {
        await api("/api/admin/summary", undefined, undefined, { Authorization: `Bearer ${password}`, "X-Aarzu-Admin": password });
        state.adminPassword = password;
        try { sessionStorage.setItem("az_admin", password); } catch {}
        await show();
      } catch (err) { toast(esc(err.message || "Could not sign in."), { icon: "x", ms: 8000 }); }
      finally { button.disabled = false; }
    };
  };

  const show = async () => {
    view.innerHTML = `<section class="wrap ap-inv-login"><p class="ap-muted">Loading…</p></section>`;
    let orders;
    try { orders = await send("/api/admin/orders"); }
    catch (err) { return err.status === 401 ? login("That password didn't work. Please sign in again.") : (view.innerHTML = `<section class="wrap ap-inv-login"><p class="ap-error">${esc(err.message)}</p></section>`); }
    let list, title, skipped = 0;
    if (bulk) {
      const confirmed = orders.filter((o) => o.status === "confirmed").sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      list = confirmed.filter((o) => shippable(o).length);
      skipped = confirmed.length - list.length;
      title = `Packing slips · ${plural(list.length, "confirmed order")}`;
    } else {
      list = orders.filter((o) => o.id === which.toUpperCase());
      title = `Invoice ${which.toUpperCase()}`;
    }
    view.innerHTML = `<div class="ap-inv-root">
      <div class="ap-inv-bar"><div class="wrap">
        <a class="link" href="/admin" data-link>${icon("arrow-left", "", 15)} Admin</a>
        <h1>${esc(title)}</h1>
        ${list.length ? `<div class="ap-paper" role="group" aria-label="Paper size">${PAPER.map((p) => `<button class="chip" data-ap-paper="${p}">${p}</button>`).join("")}</div>
        <button class="btn rani sm" data-ap-print>${ic("printer", 15)} Print${list.length > 1 ? ` ${list.length} slips` : ""}</button>` : ""}
      </div>${skipped ? `<p class="wrap ap-inv-skip">${plural(skipped, "confirmed order")} with only gift cards left out: there's nothing to pack.</p>` : ""}</div>
      <div class="ap-sheets">${list.length ? list.map(sheet).join("") : bulk
        ? empty("خالی", "No confirmed orders to pack", "Confirm orders on the Orders tab, then their packing slips appear here.", `<a class="btn ghost sm" href="/admin" data-link>Back to admin</a>`)
        : empty("گمشدہ", "Order not found", `There's no order with the number ${esc(which.toUpperCase())}.`, `<a class="btn ghost sm" href="/admin" data-link>Back to admin</a>`)}</div></div>`;
    setPaper(paper);
    view.onclick = (e) => {
      const p = e.target.closest("[data-ap-paper]");
      if (p) setPaper(p.dataset.apPaper);
      if (e.target.closest("[data-ap-print]")) window.print();
    };
  };

  pw() ? show() : login();
  return () => { document.body.classList.remove("ap-inv-mode"); $("#ap-page-size")?.remove(); };
}

function sheet(o) {
  const s = state.store || {}, c = o.customer || {}, contact = s.contact || {};
  const cod = o.payment === "cod";
  const pieces = shippable(o).reduce((n, i) => n + (i.qty || 0), 0);
  const prepaidPending = !cod && o.status === "placed";
  const collect = cod && o.total > 0
    ? `<div class="ap-collect cod"><span>Collect on delivery</span><b>COLLECT ${esc(rs(o.total))}</b><small>Cash on delivery: the rider collects this amount.</small></div>`
    : `<div class="ap-collect paid"><span>${cod ? "Nothing to collect" : "Prepaid"}</span><b>PAID</b><small>${cod ? "Fully paid with a gift card or points. Do not collect cash." : `Paid by ${esc(PAY[o.payment] || o.payment)}. Do not collect cash.`}${prepaidPending ? " <strong>Payment not confirmed yet: check before dispatch.</strong>" : ""}</small></div>`;
  const rows = (o.items || []).map((i) => `<tr>
    <td><b>${esc(i.title)}</b>${(i.addons || []).map((a) => `<span class="ap-addon">+ ${esc(a.label)} (${esc(rs(a.price))})</span>`).join("")}${i.meta?.summary ? `<small>${esc(i.meta.summary)}</small>` : ""}${i.meta?.digital ? `<small class="ap-digital">Digital: sent by WhatsApp or email, not in the parcel</small>` : ""}</td>
    <td>${esc(i.size)}</td><td class="n">${num(i.qty)}</td><td class="n">${esc(rs(i.unit))}</td><td class="n">${esc(rs(i.line))}</td></tr>`).join("");
  return `<article class="ap-sheet">
    <header class="ap-sh-head">
      <img class="ap-sh-logo" src="/brand/aarzu-logo.svg" alt="Aarzu آرزو" width="623" height="285">
      <div class="ap-sh-shop">${[contact.phone && `Phone ${esc(contact.phone)}`, contact.whatsapp && `WhatsApp +${esc(contact.whatsapp)}`, contact.email && esc(contact.email), contact.address && esc(contact.address), esc(location.host)].filter(Boolean).join("<br>")}</div>
    </header>
    <div class="ap-sh-title"><div><span>Invoice · packing slip</span><b>Order ${esc(o.id)}</b></div><div class="ap-sh-meta"><small>${esc(pktDate(o.createdAt))}</small><span class="status ${esc(o.status)}">${esc(o.status)}</span></div></div>
    <div class="ap-sh-grid">
      <section><h6>Deliver to</h6><b class="ap-sh-name">${esc(c.name)}</b><p>${esc(localPhone(c.phone))}${c.email ? `<br>${esc(c.email)}` : ""}</p><p>${esc(c.address)}<br><b>${esc(c.city)}</b></p>${c.notes ? `<p class="ap-sh-notes">Note: ${esc(c.notes)}</p>` : ""}</section>
      <section><h6>Order</h6><dl>
        <dt>Placed</dt><dd>${esc(pktDate(o.createdAt, { day: "numeric", month: "long", year: "numeric" }))}</dd>
        <dt>Payment</dt><dd>${esc(PAY[o.payment] || o.payment)}</dd>
        <dt>Pieces</dt><dd>${num(pieces)} in the parcel</dd>
        ${o.courier || o.tracking ? `<dt>Courier</dt><dd>${esc(o.courier || "")}${o.tracking ? ` · ${esc(o.tracking)}` : ""}</dd>` : ""}
        ${o.coupon ? `<dt>Code</dt><dd>${esc(o.coupon)}</dd>` : ""}</dl></section>
    </div>
    <table class="ap-sh-items"><thead><tr><th>Item</th><th>Size</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="ap-sh-bottom">
      ${collect}
      <div class="ap-sh-totals">
        <div><span>Subtotal</span><span>${esc(rs(o.subtotal))}</span></div>
        ${(o.discounts || []).map((d) => `<div class="disc"><span>${esc(d.label)}</span><span>−${esc(rs(d.amount))}</span></div>`).join("")}
        <div><span>Delivery</span><span>${o.shipping ? esc(rs(o.shipping)) : "Free"}</span></div>
        ${(o.credits || []).map((x) => `<div class="disc"><span>${esc(x.label)}</span><span>−${esc(rs(x.amount))}</span></div>`).join("")}
        <div class="total"><span>Total</span><span>${esc(rs(o.total))}</span></div>
      </div>
    </div>
    <footer class="ap-sh-thanks">
      <p><b>Thank you for shopping with Aarzu.</b> We hope you love wearing it.</p>
      <p class="urdu" lang="ur">آرزو سے خریداری کا شکریہ! امید ہے آپ کو یہ بہت پسند آئے گا۔</p>
      <small>${s.returnDays ? `Exchanges within ${esc(s.returnDays)} days of delivery on unworn items with tags. ` : ""}${contact.whatsapp ? `Questions? WhatsApp +${esc(contact.whatsapp)} with order ${esc(o.id)}.` : ""}</small>
    </footer>
  </article>`;
}

// ================================================================== register
export async function init() {
  registerRoute(/^\/admin\/invoice\/([A-Za-z0-9]{1,20})\/?$/, invoicePage);
  registerAdminTab({ key: "insights", label: "Insights", render: insightsTab });
  registerAdminTab({ key: "coupons", label: "Coupons", render: couponsTab });
  registerAdminTab({ key: "exports", label: "Exports", render: exportsTab });
}
