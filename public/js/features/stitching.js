// Darzi (tailoring) service · درزی — stitching for UNSTITCHED suits.
//   pdp-options slot   radio cards (fabric only / standard / designer), fit (size or measurements),
//                      style choices, notes, "How to measure" guide and a live price line
//   line option        { addons: [{ key: "stitching", option }], meta: { stitchMode, size|measurements, style, notes, summary } }
//   cart / checkout    honest "ready to dispatch around …" note for stitched lines
//   /stitching         information page · admin "Stitching jobs" tab with printable job cards
// Prices and labels always come from state.store.addons.stitching (never hard-coded).
import { $, $$, esc, rs, img, icon, state, card, listed, quote, stockLeft, registerSlot, registerLineOption, registerRoute, registerLink, registerAdminTab } from "../core.js";

const KEY = "stitching";
const MKEY = "az_measure";
const def = () => state.store?.addons?.[KEY];
const applies = (p) => { const d = def(); return !!(p && d && (!d.appliesTo || d.appliesTo.includes(p.category))); };
const options = () => Object.entries(def()?.options || {}).map(([key, o]) => ({ key, ...o }));
const TURN = () => def()?.turnaround || "7–10 working days";
const turnDays = () => { const n = (TURN().match(/\d+/g) || [7, 10]).map(Number); return [n[0], n[1] || n[0]]; };
const genderOf = (p) => (p?.gender === "men" ? "men" : "women");
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
// "Designer stitching (piping, lace & buttons)" -> ["Designer stitching", "piping, lace & buttons"]
const parts = (label) => { const m = String(label || "").match(/^(.*?)\s*\((.+)\)\s*$/); return m ? [m[1], m[2]] : [String(label || ""), ""]; };
const hasStitch = (i) => (i.addons || []).some((a) => a.key === KEY);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Slots are shared with other features: append our own box, never replace the slot's content.
const mount = (el, html) => { el.insertAdjacentHTML("beforeend", html); return el.lastElementChild; };

// ------------------------------------------------------------------ fit data (inches)
// m: [key, label, min, max, how to measure, colour on the figure]
const FIT = {
  women: {
    sizes: ["XS", "S", "M", "L", "XL"],
    m: [
      ["chest", "Chest", 26, 60, "Around the fullest part of the bust, tape level under the arms.", "#D6246E"],
      ["waist", "Waist", 20, 56, "Around your natural waist, the narrowest part of the torso.", "#E9A825"],
      ["hip", "Hip", 28, 64, "Around the fullest part of the hips, feet together.", "#0FA3A3"],
      ["shirtLength", "Shirt length", 20, 56, "From the highest point of the shoulder, by the neck, down to where the kameez should end.", "#1C2A6B"],
      ["sleeveLength", "Sleeve length", 4, 34, "From the shoulder point down the arm to where the sleeve should end.", "#0B5D4B"],
      ["trouserLength", "Trouser length", 20, 48, "From the waist down to the ankle, or where you like it to end.", "#F26B1D"],
    ],
    // style: [key, label, [[choice, summary text], ...]]
    style: [
      ["neckline", "Neckline", [["Round", "Round neck"], ["V neck", "V neck"], ["Boat", "Boat neck"], ["Band", "Band collar"]]],
      ["sleeves", "Sleeves", [["Full", "Full sleeves"], ["3/4", "3/4 sleeves"], ["Short", "Short sleeves"]]],
      ["trouser", "Trouser", [["Straight", "Straight trouser"], ["Shalwar", "Shalwar"], ["Culotte", "Culottes"]]],
    ],
  },
  men: {
    sizes: ["S", "M", "L", "XL", "XXL"],
    m: [
      ["chest", "Chest", 30, 64, "Around the fullest part of the chest, tape level under the arms.", "#D6246E"],
      ["shoulder", "Shoulder", 12, 26, "Straight across the back, from one shoulder point to the other.", "#E9A825"],
      ["sleeve", "Sleeve", 16, 32, "From the shoulder point down to the wrist bone, arm relaxed.", "#0B5D4B"],
      ["kameezLength", "Kameez length", 28, 52, "From the top of the shoulder, by the collar, down to where the kameez should end.", "#1C2A6B"],
      ["shalwarLength", "Shalwar length", 30, 48, "From the waist down to the ankle.", "#F26B1D"],
      ["collar", "Collar", 12, 22, "Around the base of the neck, with one finger under the tape.", "#0FA3A3"],
    ],
    style: [
      ["collarStyle", "Collar", [["Band", "Band collar"], ["Shirt", "Shirt collar"]]],
      ["cuffs", "Sleeves", [["Plain", "Plain sleeves"], ["Cuffs", "Button cuffs"]]],
      ["pockets", "Pockets", [["Side", "Side pockets"], ["Side + chest", "Side & chest pockets"], ["None", "No pockets"]]],
    ],
  },
};
const ALL_M = [...FIT.women.m, ...FIT.men.m].filter((m, i, a) => a.findIndex((x) => x[0] === m[0]) === i);
const ALL_STYLE = [...FIT.women.style, ...FIT.men.style];
const num = (v) => { const s = String(v ?? "").replace(",", ".").replace(/[^\d.]/g, ""); return s === "" ? NaN : Number(s); };

// ------------------------------------------------------------------ remembered fit (per gender)
const loadM = () => { try { return JSON.parse(localStorage.getItem(MKEY)) || {}; } catch { return {}; } };
const saveM = (g, data) => { try { const all = loadM(); all[g] = { ...(all[g] || {}), ...data }; localStorage.setItem(MKEY, JSON.stringify(all)); } catch {} };

// ------------------------------------------------------------------ dates (Mon–Sat working days, PKT)
const pkNow = () => new Date(Date.now() + (5 * 60 + new Date().getTimezoneOffset()) * 60000);
const addWork = (d, n) => { const x = new Date(d); while (n > 0) { x.setDate(x.getDate() + 1); if (x.getDay() !== 0) n--; } return x; };
const fmt = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const cityOf = (name) => { const cs = state.store.cities || []; return cs.find((c) => c.name === name) || cs[0] || { name: "your city", days: "2–4" }; };
function stitchEta(cityName, from = pkNow()) {
  const [lo, hi] = turnDays();
  const city = cityOf(cityName);
  const [dlo, dhi] = (String(city.days).match(/\d+/g) || [2, 4]).map(Number);
  const ready = [addWork(from, lo), addWork(from, hi)];
  return { ready: ready.map(fmt), arrive: [fmt(addWork(ready[0], dlo)), fmt(addWork(ready[1], dhi || dlo))], city: city.name, days: city.days };
}
const savedCity = () => { try { return localStorage.getItem("az_city"); } catch { return null; } };

// ------------------------------------------------------------------ measurement figure
const FIG = {
  women: {
    under: `<path d="M76 236 L72 300 L94 300 L99 238 Z M124 236 L128 300 L106 300 L101 238 Z" class="dz-f2"/>`,
    body: "M86 20 Q100 38 114 20 L140 27 Q150 30 154 40 L176 100 L160 106 L140 62 L136 112 Q142 170 150 232 Q100 240 50 232 Q58 170 64 112 L60 62 L40 106 L24 100 L46 40 Q50 30 60 27 Z",
    over: `<path d="M86 20 Q100 38 114 20" class="dz-trim"/><path d="M52 226 Q100 234 148 226" class="dz-trim"/><path d="M100 46 l5 5 -5 5 -5 -5z M100 66 l4 4 -4 4 -4 -4z" class="dz-motif"/>`,
    lines: { chest: [63, 74, 137, 74], waist: [66, 112, 134, 112], hip: [61, 160, 139, 160], shirtLength: [118, 23, 118, 235], sleeveLength: [145, 24, 181, 97], trouserLength: [34, 112, 34, 300] },
  },
  men: {
    under: `<path d="M68 250 Q62 280 66 302 L92 302 L99 252 Z M132 250 Q138 280 134 302 L108 302 L101 252 Z" class="dz-f2"/>`,
    body: "M88 20 Q100 26 112 20 L142 26 Q152 29 155 40 L178 116 L162 122 L140 64 L140 250 L60 250 L60 64 L38 122 L22 116 L45 40 Q48 29 58 26 Z",
    over: `<path d="M88 11 Q100 15 112 11 L112 20 Q100 25 88 20 Z" class="dz-f2"/><path d="M100 24 V86" class="dz-trim"/><circle cx="100" cy="38" r="1.8" class="dz-btn"/><circle cx="100" cy="54" r="1.8" class="dz-btn"/><circle cx="100" cy="70" r="1.8" class="dz-btn"/><path d="M60 212 V250 M140 212 V250" class="dz-trim"/>`,
    lines: { shoulder: [58, 31, 142, 31], chest: [62, 78, 138, 78], sleeve: [148, 24, 184, 114], kameezLength: [122, 23, 122, 250], shalwarLength: [36, 150, 36, 302], collar: [100, 15.5, 17, 6.5] },
  },
};
let figN = 0;
function figure(g) {
  const f = FIG[g], id = `dz-fill-${++figN}`;
  const col = Object.fromEntries(FIT[g].m.map((m) => [m[0], m[5]]));
  const line = ([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><circle cx="${x1}" cy="${y1}" r="2.6"/><circle cx="${x2}" cy="${y2}" r="2.6"/>`;
  return `<svg class="dz-fig" viewBox="0 0 200 310" role="img" aria-label="${g === "men" ? "Kameez shalwar" : "Kameez and trouser"} measuring guide">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FCE4EC"/><stop offset="1" stop-color="#FFF1D6"/></linearGradient></defs>
    ${f.under}<path d="${f.body}" fill="url(#${id})" class="dz-f1"/>${f.over}
    ${Object.entries(f.lines).map(([k, l]) => `<g data-ln="${k}" style="--c:${col[k]}">${k === "collar" ? `<ellipse cx="${l[0]}" cy="${l[1]}" rx="${l[2]}" ry="${l[3]}"/>` : line(l)}</g>`).join("")}
  </svg>`;
}
const howList = (g) => `<ol class="dz-howto">${FIT[g].m.map(([k, label, , , how, c]) => `<li data-hl="${k}" style="--c:${c}" tabindex="0"><b>${label}</b><span>${how}</span></li>`).join("")}</ol>`;
const highlight = (root, key) => {
  $$(".dz-fig", root).forEach((f) => {
    f.classList.toggle("has-on", !!key);
    $$("[data-ln]", f).forEach((l) => l.classList.toggle("on", l.dataset.ln === key));
  });
  $$("[data-hl]", root).forEach((li) => li.classList.toggle("on", li.dataset.hl === key));
};
function bindGuide(root) {
  root.addEventListener("mouseover", (e) => { const li = e.target.closest("[data-hl]"); if (li) highlight(root, li.dataset.hl); });
  root.addEventListener("mouseleave", () => highlight(root, null));
  root.addEventListener("focusin", (e) => { const k = e.target.closest("[data-hl]")?.dataset.hl || e.target.closest("[data-m]")?.dataset.m; if (k) highlight(root, k); });
}

// ------------------------------------------------------------------ product page: the Darzi selector
let uid = 0;
function blurb(o, g) {
  const [, paren] = parts(o.label);
  if (paren) return `${cap(paren)}, for an occasion-ready finish`;
  if (o.key === "standard") return `Neatly stitched to your size, with your choice of ${g === "men" ? "collar, cuffs & pockets" : "neckline, sleeves & trouser"}`;
  return "";
}
function optCard(o, n, g, checked) {
  const fabric = !o.key;
  const [title] = parts(o.label);
  return `<label class="dz-opt ${o.key ? `k-${esc(o.key)}` : "fabric"} ${checked ? "on" : ""}">
    <input type="radio" name="dz-opt-${n}" value="${esc(o.key)}" ${checked ? "checked" : ""}>
    <span class="dz-radio" aria-hidden="true"></span>
    <span class="dz-body"><b>${esc(fabric ? "Fabric only (unstitched)" : title)}</b>
      <small>${fabric ? "Take the suit to your own darzi" : esc(blurb(o, g))}</small>
      <em>${icon(fabric ? "truck" : "clock", "", 13)} ${fabric ? "Ships on our usual delivery time" : `Adds ${esc(TURN())}`}</em></span>
    <span class="dz-pr">${fabric ? "+" + rs(0) : "+" + rs(o.price)}</span>
  </label>`;
}

function darziPanel(el, data) {
  const p = state.byId[data.pid];
  if (!applies(p) || !options().length) return;
  const g = genderOf(p), fit = FIT[g], n = ++uid;
  const saved = loadM()[g] || {};
  const mode = saved.mode === "custom" ? "custom" : "size";
  const style = Object.fromEntries(fit.style.map(([k, , opts]) => [k, opts.some(([v]) => v === saved.style?.[k]) ? saved.style[k] : opts[0][0]]));
  const box = mount(el, `<section class="darzi" data-darzi data-pid="${esc(p.id)}" data-mode="${mode}">
    <header class="dz-head">
      <span class="dz-ic">${icon("scissors", "", 20)}</span>
      <div class="dz-ttl"><b>Darzi Service <span class="ur">درزی</span></b><small>Have it stitched to fit by our tailors</small></div>
      <a class="dz-how link" href="/stitching" data-link>How it works</a>
    </header>
    <div class="dz-opts" role="radiogroup" aria-label="Stitching">${[{ key: "", label: "", price: 0 }, ...options()].map((o, i) => optCard(o, n, g, i === 0)).join("")}</div>
    <div class="dz-more" inert><div class="dz-more-in">
      <div class="dz-row"><span class="dz-lbl">${icon("ruler", "", 14)} Your fit</span>
        <div class="tabs dz-mode"><button type="button" data-dz-mode="size" class="${mode === "size" ? "on" : ""}" aria-pressed="${mode === "size"}">Standard size</button><button type="button" data-dz-mode="custom" class="${mode === "custom" ? "on" : ""}" aria-pressed="${mode === "custom"}">My measurements</button></div></div>
      <div class="dz-pane" data-pane="size">
        <div class="sizes dz-sizes" role="group" aria-label="Stitching size">${fit.sizes.map((z) => `<button type="button" data-dz-size="${z}" class="${saved.size === z ? "on" : ""}" aria-pressed="${saved.size === z}">${z}</button>`).join("")}</div>
        <p class="dz-hint">Cut to our standard <a href="/size-guide" data-link>${g === "men" ? "men's" : "women's"} size chart</a>. Between sizes? Choose the larger, or switch to your own measurements.</p>
      </div>
      <div class="dz-pane" data-pane="custom">
        <div class="dz-mgrid">${fit.m.map(([k, label, lo, hi, , c]) => `<div class="field dz-m" data-m="${k}" style="--c:${c}"><label for="dz-${n}-${k}">${label}</label><div class="dz-in"><input id="dz-${n}-${k}" name="${k}" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="${lo}–${hi}" value="${esc(saved.m?.[k] ?? "")}"><span>in</span></div><span class="msg"></span></div>`).join("")}</div>
        <details class="dz-guide"><summary>${icon("ruler", "", 16)} How to measure ${icon("plus", "", 16)}</summary>
          <div class="dz-guide-body">${figure(g)}${howList(g)}</div>
          <p class="dz-hint">Measure over light clothing and keep the tape snug, not tight. No tape? Lay a kameez that fits you well flat, measure it, and double the chest and waist widths.</p>
        </details>
      </div>
      <div class="dz-styles"><span class="dz-lbl">${icon("wand-sparkles", "", 14)} Your style</span>
        ${fit.style.map(([k, label, opts]) => `<div class="dz-style"><span class="dz-sl">${label}</span><div class="dz-chips" role="group" aria-label="${label}">${opts.map(([v]) => `<button type="button" class="chip ${style[k] === v ? "on" : ""}" data-dz-style="${k}" data-v="${esc(v)}" aria-pressed="${style[k] === v}">${esc(v)}</button>`).join("")}</div></div>`).join("")}
      </div>
      <div class="field dz-notes"><label for="dz-${n}-notes">Notes for the darzi <small>(optional)</small></label><textarea id="dz-${n}-notes" maxlength="200" rows="2" placeholder="${g === "men" ? "e.g. keep the kameez a little loose" : "e.g. add side slits, keep the shirt a little loose"}"></textarea><span class="hint"><span data-dz-count>0</span>/200</span></div>
      <div class="dz-eta">${icon("clock", "", 18)}<span data-dz-eta></span></div>
    </div></div>
    <div class="dz-price" aria-live="polite"><span class="dz-eq"><span class="dz-fab">Fabric only</span><span class="dz-st">Suit <b>${rs(p.price)}</b> <i>+</i> stitching <b data-dz-add>${rs(0)}</b> <i>=</i></span></span><b class="dz-total" data-dz-total>${rs(p.price)}</b><small data-dz-sub></small></div>
  </section>`);
  wirePanel(box, p, g);
}

// Read the selector state straight from the DOM (also used by the line option).
function readPanel(box, p) {
  const fit = FIT[genderOf(p)];
  return {
    option: $("input[type=radio]:checked", box)?.value || "",
    mode: box.dataset.mode === "custom" ? "custom" : "size",
    size: $("[data-dz-size].on", box)?.dataset.dzSize || "",
    m: Object.fromEntries(fit.m.map(([k]) => [k, $(`input[name="${k}"]`, box)?.value.trim() || ""])),
    style: Object.fromEntries(fit.style.map(([k]) => [k, $(`[data-dz-style="${k}"].on`, box)?.dataset.v || ""])),
    notes: $("textarea", box)?.value || "",
  };
}

function wirePanel(box, p, g) {
  const fit = FIT[g];
  const scope = box.closest(".modal-box") || box.closest("main > *") || document;
  const addBtn = $("#add", scope);
  const persist = () => { const s = readPanel(box, p); saveM(g, { mode: s.mode, size: s.size, m: s.m, style: s.style }); };
  const tween = (el, to) => {
    const from = Number(el.dataset.v ?? to);
    el.dataset.v = to;
    if (from === to || reduced()) { el.textContent = rs(to); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 520); el.textContent = rs(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const update = () => {
    const key = $("input[type=radio]:checked", box)?.value || "";
    const opt = def().options[key];
    const add = opt ? opt.price : 0, unit = p.price + add;
    const qty = Math.max(1, Number($("#qty", scope)?.textContent) || 1);
    box.classList.toggle("on", !!opt);
    $(".dz-more", box).inert = !opt;
    $$(".dz-opt", box).forEach((l) => l.classList.toggle("on", $("input", l).checked));
    tween($("[data-dz-add]", box), add);
    tween($("[data-dz-total]", box), unit);
    $("[data-dz-sub]", box).textContent = qty > 1 ? `× ${qty} suits = ${rs(unit * qty)}` : opt ? "per suit, paid together on delivery" : "take it to your own darzi, or add stitching above";
    const d = stitchEta($("#city", scope)?.value || savedCity());
    $("[data-dz-eta]", box).innerHTML = `Stitched & ready to dispatch around <b>${d.ready[0]} – ${d.ready[1]}</b>, arriving in ${esc(d.city)} around <b>${d.arrive[1]}</b>.`;
    // keep the main button honest about the stitched price
    if (addBtn && !addBtn.disabled && /Add to bag/.test(addBtn.textContent)) addBtn.innerHTML = `${icon("shopping-bag", "", 18)} Add to bag · ${rs(unit)}`;
  };
  const setMode = (m) => {
    box.dataset.mode = m;
    $$("[data-dz-mode]", box).forEach((b) => { b.classList.toggle("on", b.dataset.dzMode === m); b.setAttribute("aria-pressed", b.dataset.dzMode === m); });
    persist();
  };
  const checkField = (input) => {
    const fd = input.closest(".field"), m = fit.m.find((x) => x[0] === input.name);
    const v = num(input.value), bad = input.value.trim() !== "" && !(v >= m[2] && v <= m[3]);
    fd.classList.toggle("err", bad);
    $(".msg", fd).textContent = bad ? `${m[2]}–${m[3]} inches` : "";
  };

  box.addEventListener("change", (e) => {
    if (e.target.type === "radio") {
      update();
      if (e.target.value) { const ic = $(".dz-ic", box); ic.classList.remove("snip"); void ic.offsetWidth; ic.classList.add("snip"); }
    }
  });
  box.addEventListener("click", (e) => {
    const md = e.target.closest("[data-dz-mode]");
    if (md) setMode(md.dataset.dzMode);
    const sz = e.target.closest("[data-dz-size]");
    if (sz) { $$("[data-dz-size]", box).forEach((b) => { b.classList.toggle("on", b === sz); b.setAttribute("aria-pressed", b === sz); }); persist(); }
    const st = e.target.closest("[data-dz-style]");
    if (st) { $$(`[data-dz-style="${st.dataset.dzStyle}"]`, box).forEach((b) => { b.classList.toggle("on", b === st); b.setAttribute("aria-pressed", b === st); }); persist(); }
  });
  box.addEventListener("input", (e) => {
    if (e.target.matches(".dz-m input")) { e.target.closest(".field").classList.remove("err"); $(".msg", e.target.closest(".field")).textContent = ""; persist(); }
    if (e.target.tagName === "TEXTAREA") $("[data-dz-count]", box).textContent = e.target.value.length;
  });
  box.addEventListener("focusout", (e) => { if (e.target.matches(".dz-m input")) checkField(e.target); });
  bindGuide(box);
  // the core page owns qty and city; follow them (after its own handler has run)
  if (scope !== document) {
    scope.addEventListener("click", (e) => { if (e.target.closest("[data-qd]")) setTimeout(update, 0); });
    scope.addEventListener("change", (e) => { if (e.target.id === "city") setTimeout(update, 0); });
  }
  update();
}

// Mark a problem, bring it into view, and explain it (the core shows the message as a toast).
function flag(box, el, msg) {
  if (el) {
    el.classList.remove("err", "shake"); void el.offsetWidth;
    el.classList.add(el.classList.contains("sizes") ? "shake" : "err");
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    $("input", el)?.focus({ preventScroll: true });
  }
  throw new Error(msg);
}

function lineOption(p, pageEl) {
  if (!applies(p) || !pageEl) return {};
  const box = $$("[data-darzi]", pageEl).find((b) => b.dataset.pid === p.id);
  if (!box) return {};
  const s = readPanel(box, p);
  const opt = def().options[s.option];
  if (!s.option || !opt) return {};
  const g = genderOf(p), fit = FIT[g];
  const meta = { stitchMode: s.mode };
  if (s.mode === "size") {
    if (!fit.sizes.includes(s.size)) flag(box, $(".dz-sizes", box), `Choose your stitching size (${fit.sizes[0]}–${fit.sizes.at(-1)}), or switch to "My measurements".`);
    meta.size = s.size;
  } else {
    for (const [k, label, lo, hi] of fit.m) {
      const fd = $(`.dz-m[data-m="${k}"]`, box), v = num(s.m[k]);
      if (!Number.isFinite(v)) flag(box, fd, `Please add your ${label.toLowerCase()} measurement in inches.`);
      if (v < lo || v > hi) flag(box, fd, `${label} of ${v}″ looks unusual: it should be between ${lo} and ${hi} inches.`);
      meta[k] = Math.round(v * 4) / 4; // nearest quarter inch
    }
  }
  const words = [];
  for (const [k, , opts] of fit.style) {
    const pick = opts.find(([v]) => v === s.style[k]) || opts[0];
    meta[k] = pick[0];
    words.push(pick[1]);
  }
  const notes = s.notes.replace(/[<>]/g, "").trim().slice(0, 200);
  if (notes) meta.notes = notes;
  meta.summary = ["Stitched", s.mode === "size" ? `size ${s.size}` : "my measurements", ...words].join(" · ");
  saveM(g, { mode: s.mode, size: s.size, m: s.m, style: Object.fromEntries(fit.style.map(([k]) => [k, meta[k]])) });
  return { addons: [{ key: KEY, option: s.option }], meta };
}

// ------------------------------------------------------------------ bag + checkout notes (real cart data only)
function cartNote(el, data) {
  const q = data.quote || quote();
  const opts = options();
  if (!opts.length) return;
  const stitched = q.items.filter(hasStitch);
  const plain = q.items.filter((i) => !hasStitch(i) && applies(state.byId[i.id]));
  if (stitched.length) {
    const d = stitchEta(savedCity());
    const n = stitched.reduce((s, i) => s + i.qty, 0);
    mount(el, `<div class="dz-note">${icon("scissors", "", 18)}<span><b>${n} ${n === 1 ? "suit" : "suits"} going to our darzi.</b> Ready to dispatch around ${d.ready[0]} – ${d.ready[1]}.</span></div>`);
  } else if (plain.length) {
    const i = plain[0];
    mount(el, `<a class="dz-note soft" href="/product/${esc(i.slug)}" data-link data-close>${icon("scissors", "", 18)}<span>Want <b>${esc(i.title)}</b> stitched? Add Darzi service from ${rs(Math.min(...opts.map((o) => o.price)))} on its page.</span>${icon("chevron-right", "", 16)}</a>`);
  }
}

function checkoutNote(el) {
  const q = quote();
  const stitched = q.items.filter(hasStitch);
  if (!stitched.length) return;
  const form = el.closest("form");
  const box = mount(el, `<div class="dz-co-wrap"></div>`);
  const draw = () => {
    const d = stitchEta(form?.city?.value || savedCity());
    box.innerHTML = `<div class="dz-co">${icon("scissors", "", 20)}<div><b>Made to measure</b><p>Your stitched ${stitched.length === 1 ? "suit is" : "suits are"} ready to dispatch around <b>${d.ready[0]} – ${d.ready[1]}</b> and should reach ${esc(d.city)} around <b>${d.arrive[1]}</b>. Stitching adds ${esc(TURN())}, so the date above is for ready-to-ship pieces.</p>
      <ul>${stitched.map((i) => `<li>${esc(i.title)} · ${esc(i.meta?.summary || i.addons.find((a) => a.key === KEY).label)}</li>`).join("")}</ul></div></div>`;
  };
  draw();
  form?.addEventListener("change", (e) => e.target.name === "city" && draw());
}

// ------------------------------------------------------------------ /stitching page
function page(view) {
  document.title = "Darzi stitching service · Aarzu";
  const s = state.store, opts = options();
  const unst = listed().filter((p) => applies(p));
  const minAdd = opts.length ? Math.min(...opts.map((o) => o.price)) : 0;
  const minSuit = unst.length ? Math.min(...unst.map((p) => p.price)) : 0;
  const picks = [...unst.filter((p) => stockLeft(p) > 0), ...unst.filter((p) => !stockLeft(p))].slice(0, 4);
  const path = "M-20 70 C 140 10, 260 120, 420 64 S 700 8, 860 66 S 1100 124, 1220 52";
  const anim = reduced() ? "" : `<animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.82;1" dur="7s" repeatCount="indefinite"/>`;
  const steps = [
    ["shirt", "Choose your fabric", `Pick any of ${unst.length ? `our ${unst.length}` : "our"} unstitched suits and find the Darzi Service box on its page.`, "#D6246E"],
    ["ruler", "Share your fit", "Choose a standard size or enter your own measurements in inches. We remember them on your phone for next time.", "#E9A825"],
    ["scissors", "Our darzi stitches", `Cut, stitched, pressed and checked by hand. Stitching adds ${TURN()}.`, "#0FA3A3"],
    ["truck", "Delivered to your door", "Pay for the suit and stitching together, cash on delivery anywhere in Pakistan.", "#1C2A6B"],
  ];
  const PLAN = {
    standard: { ur: "سلائی", c: "#0FA3A3", ic: "scissors", pts: ["Cut & stitched to your size or measurements", "Your choice of neckline or collar, sleeves and bottoms", "Pressed & quality-checked before dispatch"] },
    designer: { ur: "ڈیزائنر", c: "#C9A24A", ic: "gem", pts: ["Everything in standard stitching", "", "For Eid, weddings and special days"] },
  };
  const plans = [
    { key: "", title: "Fabric only", ur: "کپڑا", c: "#D6246E", ic: "shirt", price: 0, pts: ["The full unstitched suit, as listed", "Take it to your own darzi", "Ships on our usual delivery time"], turn: "No extra time" },
    ...opts.map((o) => { const [title, paren] = parts(o.label); const m = PLAN[o.key] || { ur: "درزی", c: "#1C2A6B", ic: "scissors", pts: ["Stitched by our tailors to your fit"] }; return { ...o, title, ur: m.ur, c: m.c, ic: m.ic, pts: m.pts.map((t) => t || (paren ? `Finished with ${paren}` : "")).filter(Boolean), turn: `Adds ${TURN()}` }; }),
  ];
  const feat = plans.length > 2 ? plans.at(-1).key : null;
  const faq = [
    ["Which suits can be stitched?", "Any suit in our unstitched collection: look for the Darzi Service box on the product page. Ready-to-wear pieces already come stitched in standard sizes."],
    ["How long does stitching take?", `Stitching adds ${esc(TURN())} before your order is dispatched. Delivery to your city then takes the usual time, for example ${esc(cityOf().name)} in ${esc(cityOf().days)} days.`],
    ["Standard size or my own measurements?", "If you usually fit one of our standard sizes, choose it and we'll cut to our size chart. For a closer fit, enter your own measurements in inches. Measuring a kameez that already fits you well works too."],
    ["How do I pay for stitching?", "The stitching charge is added to the suit price in your bag and you pay for both together: cash on delivery, bank transfer, JazzCash or Easypaisa."],
    ["Do discounts apply to stitching?", "Multi-buy savings are worked out on the suit price, and the stitching charge stays flat. Discount codes apply to your order as usual."],
    ["Can I exchange a stitched suit?", `Because it's made to your size, a stitched suit can't be exchanged for another size or design (see our <a href="/shipping" data-link>delivery & exchange policy</a>). Please double-check your measurements, and message us on WhatsApp if anything isn't right when it arrives.`],
    ["Can I change my measurements after ordering?", "Message us on WhatsApp with your order number as soon as you can, and we'll do our best to update your job card before cutting starts."],
  ];
  const wa = `https://wa.me/${s.contact.whatsapp}?text=${encodeURIComponent("Assalam o Alaikum Aarzu! I have a question about stitching.")}`;

  view.innerHTML = `<section class="phero dz-hero">
      <span class="eyebrow">Darzi service · درزی</span>
      <h1>Unstitched, made <em class="grad-text">perfectly yours</em></h1>
      <div class="urdu">آپ کا ناپ، ہمارا ہنر</div>
      <p>Choose any unstitched suit and our tailors will cut, stitch and press it to your size${minAdd ? `, from ${rs(minAdd)}` : ""}. No darzi queues, no follow-up calls.</p>
      <div class="dz-facts">${[
        unst.length ? ["shirt", `${unst.length} unstitched ${unst.length === 1 ? "suit" : "suits"} to choose from`] : null,
        unst.length && minAdd ? ["tag", `Stitched suits from ${rs(minSuit + minAdd)}`] : null,
        ["clock", `Adds ${TURN()}`], ["banknote", "Cash on delivery"],
      ].filter(Boolean).map(([ic, t]) => `<span>${icon(ic, "", 15)} ${esc(t)}</span>`).join("")}</div>
      <div class="dz-hero-ctas"><a class="btn rani" href="/shop?category=unstitched" data-link>${icon("scissors", "", 16)} Shop unstitched suits</a><button class="btn ghost-light" data-dz-jump="dz-pricing">See pricing</button></div>
      <svg class="dz-thread" viewBox="0 0 1200 130" aria-hidden="true">
        <defs><mask id="dz-thread-m"><path d="${path}" pathLength="1" stroke="#fff" stroke-width="14" fill="none" stroke-dasharray="1" stroke-dashoffset="${reduced() ? 0 : 1}">${anim}</path></mask></defs>
        <path d="${path}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>
        <path id="dz-thread-p" d="${path}" fill="none" stroke="#F2A900" stroke-width="3" stroke-linecap="round" stroke-dasharray="14 11" mask="url(#dz-thread-m)"/>
        ${reduced() ? "" : `<g class="dz-needle"><path d="M-30 0 L16 -2.4 Q26 0 16 2.4 Z" fill="#EDE7F0"/><ellipse cx="-22" cy="0" rx="5" ry="1.1" fill="#3A1530"/><animateMotion dur="7s" repeatCount="indefinite" rotate="auto" keyPoints="0;1;1" keyTimes="0;.82;1" calcMode="linear"><mpath href="#dz-thread-p"/></animateMotion></g>`}
      </svg>
    </section>

    <section class="sec wrap" id="dz-how">
      <div class="sec-head" data-reveal><span class="eyebrow">How it works</span><h2>From fabric to <em>fitted</em> in four steps</h2><div class="urdu">چار آسان مراحل</div></div>
      <div class="dz-steps" data-reveal="fade">${steps.map(([ic, t, d, c], i) => `<div class="dz-stepc" data-reveal style="--i:${i};--c:${c}"><span class="ic">${icon(ic, "", 30)}<span class="n">${i + 1}</span></span><div><h4>${t}</h4><p>${esc(d)}</p></div></div>`).join("")}</div>
    </section>

    <section class="sec dz-pricing-sec" id="dz-pricing"><div class="wrap">
      <div class="sec-head" data-reveal><span class="eyebrow">Pricing</span><h2>One flat price, <em>per suit</em></h2><div class="urdu">سلائی کی قیمت</div><p>Added to the suit price in your bag and paid together on delivery.</p></div>
      <div class="dz-plans">${plans.map((pl, i) => `<article class="dz-plan ${pl.key === feat ? "feat" : ""}" data-reveal style="--i:${i};--c:${pl.c}">
        ${pl.key === feat ? `<span class="tag">${icon("sparkles", "", 12)} Finest finish</span>` : ""}
        <span class="pic">${icon(pl.ic, "", 22)}</span>
        <div><div class="ur">${pl.ur}</div><h3>${esc(pl.title)}</h3></div>
        <div class="amt"><b>+${rs(pl.price)}</b><span>${pl.key ? "per suit" : "nothing extra"}</span></div>
        <ul>${pl.pts.map((t) => `<li>${icon("check", "", 16)}<span>${esc(t)}</span></li>`).join("")}</ul>
        <div class="turn">${icon("clock", "", 15)} ${esc(pl.turn)}</div>
        <a class="btn ${pl.key === feat ? "gold" : "ghost"} sm" href="/shop?category=unstitched" data-link>Choose a suit</a>
      </article>`).join("")}</div>
    </div></section>

    <section class="sec wrap" id="dz-time">
      <div class="sec-head" data-reveal><span class="eyebrow">Turnaround</span><h2>When will it <em>arrive?</em></h2><div class="urdu">کب تک ملے گا؟</div><p>Real dates from today, counting Monday to Saturday as working days.</p></div>
      <div class="dz-when card-box" data-reveal>
        <label class="dz-city">${icon("map-pin", "", 16)} Delivering to <select id="dz-city">${s.cities.map((c) => `<option ${c.name === savedCity() ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
        <div class="dz-miles" id="dz-miles"></div>
      </div>
    </section>

    <section class="sec dz-guide-sec" id="dz-guide"><div class="wrap">
      <div class="sec-head" data-reveal><span class="eyebrow">Measuring guide</span><h2>Measure once, <em>fit forever</em></h2><div class="urdu">ناپ لینے کا طریقہ</div><p>All measurements in inches. Hover or tap a measurement to see where it goes.</p></div>
      <div style="text-align:center;margin-bottom:28px"><div class="tabs" id="dz-gtabs"><button data-dz-g="women" class="on">Women</button><button data-dz-g="men">Men</button></div></div>
      <div class="dz-gwrap" id="dz-gwrap" data-reveal></div>
      <div class="dz-tips">${[["Light clothing", "Measure over a thin kameez, never over a sweater or jacket."], ["Snug, not tight", "You should fit one finger under the tape."], ["Stand relaxed", "Arms by your side, and ask someone to help if you can."], ["No tape?", "Measure a kameez that fits you well, laid flat. Double the chest and waist."]].map(([t, d], i) => `<div class="dz-tip" data-reveal style="--i:${i}"><b>${t}</b><span>${d}</span></div>`).join("")}</div>
      <p class="dz-hint" style="text-align:center;margin-top:20px">Prefer standard sizes? See our <a href="/size-guide" data-link>size guide</a>, or <a href="${esc(wa)}" target="_blank" rel="noopener">ask us on WhatsApp</a>.</p>
    </div></section>

    <section class="sec wrap">
      <div class="sec-head" data-reveal><span class="eyebrow">Questions</span><h2>Darzi <em>FAQ</em></h2><div class="urdu">عام سوالات</div></div>
      <div class="prose">${faq.map(([q, a], i) => `<details class="acc" ${i ? "" : "open"} data-reveal style="--i:${i}"><summary>${q} ${icon("plus", "", 16)}</summary><div class="body">${a}</div></details>`).join("")}</div>
    </section>

    <section class="sec wrap" style="padding-top:0">
      <div class="dz-cta" data-reveal="zoom"><div><span class="eyebrow">Ready when you are</span><h2>Pick your fabric, <em>we'll do the rest</em></h2><p>Add Darzi service on any unstitched suit's page.</p></div>
        <div class="dz-cta-btns"><a class="btn gold" href="/shop?category=unstitched" data-link>Shop unstitched</a><a class="btn ghost-light" href="${esc(wa)}" target="_blank" rel="noopener">${icon("whatsapp", "", 18)} Ask on WhatsApp</a></div></div>
      ${picks.length ? `<div class="grid" style="--cols:4;margin-top:40px">${picks.map((p, i) => card(p, { i })).join("")}</div>` : ""}
    </section>`;

  const miles = () => {
    const d = stitchEta($("#dz-city", view).value);
    const today = fmt(pkNow());
    $("#dz-miles", view).innerHTML = [
      ["shopping-bag", "Order placed", today, "Today", "#D6246E"],
      ["scissors", "Ready to dispatch", `${d.ready[0]} – ${d.ready[1]}`, `Stitching · ${TURN()}`, "#E9A825"],
      ["truck", `Arrives in ${d.city}`, `${d.arrive[0]} – ${d.arrive[1]}`, `Delivery · ${d.days} working days`, "#0FA3A3"],
    ].map(([ic, t, date, sub, c], i) => `<div class="dz-mile" style="--c:${c};--i:${i}"><span class="ic">${icon(ic, "", 20)}</span><small>${esc(t)}</small><b>${esc(date)}</b><span>${esc(sub)}</span></div>`).join("");
  };
  miles();
  $("#dz-city", view).onchange = (e) => { try { localStorage.setItem("az_city", e.target.value); } catch {} miles(); };

  const guide = (g) => {
    const w = $("#dz-gwrap", view);
    w.innerHTML = `<div class="dz-gfig swap-in">${figure(g)}</div><div class="swap-in">${howList(g)}<div class="dz-range">${FIT[g].m.map(([, l, lo, hi]) => `<span>${l} <b>${lo}–${hi}″</b></span>`).join("")}</div></div>`;
  };
  guide("women");
  bindGuide($("#dz-gwrap", view));
  view.addEventListener("click", (e) => {
    const t = e.target.closest("[data-dz-g]");
    if (t) { $$("[data-dz-g]", view).forEach((b) => b.classList.toggle("on", b === t)); guide(t.dataset.dzG); }
    const j = e.target.closest("[data-dz-jump]");
    if (j) $(`#${j.dataset.dzJump}`, view)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    const li = e.target.closest("[data-hl]");
    if (li) highlight($("#dz-gwrap", view), li.dataset.hl);
  });
}

// ------------------------------------------------------------------ admin: printable job cards
const fmtPhone = (p) => { const d = String(p || ""); return /^92\d{10}$/.test(d) ? `+92 ${d.slice(2, 5)} ${d.slice(5)}` : d; };
const STATUS = [["all", "All"], ["open", "To stitch"], ["dispatched", "Dispatched"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]];
const inFilter = (f, o) => f === "all" || (f === "open" ? ["placed", "confirmed"].includes(o.status) : o.status === f);

function jobCard({ o, i, a, idx }) {
  const m = i.meta || {};
  const p = state.byId[i.id];
  const placed = new Date(Date.parse(o.createdAt) + (5 * 60 + new Date().getTimezoneOffset()) * 60000);
  const due = fmt(addWork(placed, turnDays()[1]));
  const meas = ALL_M.filter(([k]) => m[k] != null && m[k] !== "");
  const styles = ALL_STYLE.filter(([k]) => m[k]);
  const fit = m.stitchMode === "size" || m.size
    ? `<div class="dz-szpill">Size <b>${esc(m.size || "?")}</b></div><small>Standard ${p?.gender === "men" ? "men's" : "women's"} chart</small>`
    : meas.length ? `<table class="dz-mt">${meas.map(([k, l]) => `<tr><td>${l}</td><td><b>${esc(m[k])}″</b></td></tr>`).join("")}</table>`
    : `<small>No fit details recorded. Call the customer.</small>`;
  return `<article class="dz-job" data-job="${esc(o.id)}-${idx}">
    <header class="dz-job-top"><div><b class="dz-job-id">${esc(o.id)}</b><small> · line ${idx + 1}</small><span>Ordered ${esc(new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }))}</span></div><span class="status ${esc(o.status)}">${esc(o.status)}</span></header>
    <div class="dz-job-prod">${i.image ? `<img src="${esc(img(i.image))}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ""}<div><b>${esc(i.title)}</b><span>${esc(a.label)} · ×${Number(i.qty) || 1}${p?.fabric ? ` · ${esc(p.fabric)}` : ""}</span>${o.status === "cancelled" ? "" : `<em>${icon("clock", "", 13)} Target ready by ${esc(due)}</em>`}</div></div>
    <div class="dz-job-grid">
      <section><h6>Customer</h6><p><b>${esc(o.customer?.name)}</b><br>${esc(o.customer?.city)}<br><a href="tel:+${esc(o.customer?.phone)}">${esc(fmtPhone(o.customer?.phone))}</a></p></section>
      <section><h6>Fit</h6>${fit}</section>
      <section><h6>Style</h6>${styles.length ? `<ul>${styles.map(([k, l]) => `<li><span>${l}</span> <b>${esc(m[k])}</b></li>`).join("")}</ul>` : "<small>Darzi's choice</small>"}</section>
    </div>
    ${m.notes ? `<div class="dz-job-notes"><h6>Notes for the darzi</h6><p>${esc(m.notes)}</p></div>` : ""}
    <footer class="dz-job-foot"><div class="dz-checks">${["Cut", "Stitched", "Pressed", "Checked"].map((t) => `<span><i></i>${t}</span>`).join("")}</div><button class="btn ghost sm" data-dz-print="${esc(o.id)}-${idx}">${icon("list", "", 14)} Print</button></footer>
  </article>`;
}

function printCards(nodes) {
  if (!nodes.length) return;
  $("#dz-print")?.remove();
  const host = document.createElement("div");
  host.id = "dz-print";
  host.innerHTML = `<div class="dz-print-head"><b>Aarzu · Darzi job cards</b><span>${nodes.length} ${nodes.length === 1 ? "card" : "cards"} · printed ${esc(new Date().toLocaleString("en-GB"))}</span></div>${nodes.map((n) => n.outerHTML).join("")}`;
  document.body.append(host);
  document.body.classList.add("dz-printing");
  const done = () => { document.body.classList.remove("dz-printing"); host.remove(); };
  addEventListener("afterprint", done, { once: true });
  window.print();
}

async function adminTab(el, call) {
  el.innerHTML = `<div class="dz-admin"><p class="dz-hint">Loading stitching jobs…</p></div>`;
  const orders = await call("/api/admin/orders");
  const jobs = [];
  for (const o of orders) (o.items || []).forEach((i, idx) => { const a = (i.addons || []).find((x) => x.key === KEY); if (a) jobs.push({ o, i, a, idx }); });
  let filter = "all";
  const draw = () => {
    const shown = jobs.filter((j) => inFilter(filter, j.o));
    if (filter === "open") shown.sort((x, y) => Date.parse(x.o.createdAt) - Date.parse(y.o.createdAt)); // oldest first: most urgent
    const open = jobs.filter((j) => inFilter("open", j.o));
    el.innerHTML = `<div class="dz-admin">
      <div class="dz-admin-head"><div><h3>Darzi job cards <span class="ur">درزی</span></h3><p>${jobs.length} stitching ${jobs.length === 1 ? "line" : "lines"} across ${new Set(jobs.map((j) => j.o.id)).size} orders · <b>${open.reduce((s, j) => s + (Number(j.i.qty) || 1), 0)}</b> suits still to stitch</p></div>
        ${shown.length ? `<button class="btn rani sm" data-dz-print-all>${icon("list", "", 14)} Print ${shown.length} job ${shown.length === 1 ? "card" : "cards"}</button>` : ""}</div>
      <div class="dz-filter">${STATUS.map(([k, l]) => `<button class="chip ${k === filter ? "on" : ""}" data-dz-f="${k}">${l} <small>${jobs.filter((j) => inFilter(k, j.o)).length}</small></button>`).join("")}</div>
      ${shown.length ? `<div class="dz-jobs">${shown.map(jobCard).join("")}</div>`
        : `<div class="empty-state"><div class="ur">درزی</div><h3>${jobs.length ? "Nothing in this list" : "No stitching jobs yet"}</h3><p>${jobs.length ? "Try another filter." : "When a shopper adds Darzi service to an unstitched suit, its job card appears here, ready to print for the tailor."}</p></div>`}
    </div>`;
    $$(".dz-job img", el).forEach((im) => im.addEventListener("error", () => im.remove(), { once: true }));
  };
  draw();
  el.onclick = (e) => {
    const f = e.target.closest("[data-dz-f]");
    if (f) { filter = f.dataset.dzF; draw(); }
    if (e.target.closest("[data-dz-print-all]")) printCards($$(".dz-job", el));
    const one = e.target.closest("[data-dz-print]");
    if (one) printCards($$(".dz-job", el).filter((n) => n.dataset.job === one.dataset.dzPrint));
  };
}

// ------------------------------------------------------------------ register
export async function init() {
  registerSlot("pdp-options", darziPanel);
  registerLineOption(lineOption);
  registerSlot("cart-extras", cartNote);
  registerSlot("checkout-extras", checkoutNote);
  registerRoute(/^\/stitching\/?$/, page);
  registerLink({ where: "help", label: "Stitching service", href: "/stitching" });
  registerLink({ where: "menu", label: "Darzi stitching", href: "/stitching" });
  registerAdminTab({ key: "stitching", label: "Stitching jobs", render: adminTab });
}
