// Aarzu guides · رہنمائی — help shoppers pick the right size and the right fabric.
//   pdp-options    size finder for ready-to-wear: "Find my size" (height, weight, fit) -> a size from
//                  the shop's own chart, "Select M" picks it on the page. Answers are kept per gender in
//                  localStorage, so later pieces show "Your size: M" straight away (with an edit link).
//   pdp-after      a short, collapsible wash & care box for the product's fabric
//   /fabric-guide  every fabric in the live catalogue: season, feel, best for, care, and a shop link
//                  with the real number of listed pieces
// "Complete the look" is not added here: pages.js already shows a "Finish it with a dupatta" section
// (store.bundle) on suit pages, and the bag drawer has its own upsell.
import { $, $$, esc, img, icon, state, listed, toast, openOverlay, closeOverlay, registerRoute, registerSlot, registerLink } from "../core.js";

// Slots are shared with other features: append our own box, never replace the slot's content.
const mount = (el, html) => { el.insertAdjacentHTML("beforeend", html); return el.lastElementChild; };
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ================================================================== size finder
// Chest (inches) for each size, copied from the size-guide tables in public/js/pages.js (sizeTables(),
// shown on /size-guide and in the "Size guide" modal). Keep the two in sync.
const CHART = {
  women: [["XS", 34], ["S", 36], ["M", 38], ["L", 41], ["XL", 44]],
  men: [["S", 40], ["M", 42], ["L", 44], ["XL", 46], ["XXL", 48]],
};
const ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const FITS = [["fitted", "Fitted", "Close to the body"], ["regular", "Regular", "The usual, easy cut"], ["relaxed", "Relaxed", "Loose and roomy"]];
// Room added to the body chest before matching a size (inches). "Regular" sizes up when you are between sizes,
// as the size guide suggests; "relaxed" lands about one size up.
const EASE = { fitted: -0.5, regular: 0.5, relaxed: 2.5 };
// Rough chest estimate: chest grows with the square root of weight, and is a little smaller for a taller
// frame at the same weight. K is set so an average adult lands on typical survey averages
// (women ~163 cm / 62 kg -> ~89 cm chest, men ~176 cm / 78 kg -> ~99 cm). It is only a starting point,
// which is why the finder also takes a real chest measurement.
const K = { women: 52.27, men: 52.47 };
const estChest = (g, heightIn, kg) => (K[g] * Math.sqrt(kg) * Math.pow(heightIn * 2.54, -0.3)) / 2.54;
const halfIn = (n) => Math.round(n * 2) / 2;
const fmtIn = (n) => String(halfIn(n)).replace(/\.5$/, "½");
const ftIn = (n) => `${Math.floor(n / 12)}′ ${n % 12}″`;

const FKEY = "az_fit";
const loadFit = () => { try { const v = JSON.parse(localStorage.getItem(FKEY)); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const saveFit = (all) => { try { localStorage.setItem(FKEY, JSON.stringify(all)); } catch {} };

// The product's sizes with a chest from the chart. A size just past either end of the chart (men's XS)
// is placed one chart step beyond its neighbour, and flagged so we can say so.
function sizeRows(p) {
  if (p?.category !== "ready-to-wear" || !CHART[p.gender] || (p.sizes || []).length < 2) return null;
  const chart = new Map(CHART[p.gender]);
  const rows = p.sizes.filter((z) => chart.has(z)).map((z) => ({ z, chest: chart.get(z) })).sort((a, b) => a.chest - b.chest);
  if (rows.length < 2) return null;
  for (const z of p.sizes) {
    if (chart.has(z)) continue;
    const i = ORDER.indexOf(z), lo = rows[0], hi = rows.at(-1);
    if (i >= 0 && ORDER[i + 1] === lo.z) rows.unshift({ z, chest: lo.chest - (rows[1].chest - lo.chest), near: lo.z, dir: "below" });
    else if (i > 0 && ORDER[i - 1] === hi.z) rows.push({ z, chest: hi.chest + (hi.chest - rows.at(-2).chest), near: hi.z, dir: "above" });
  }
  return rows;
}
const inStock = (p, z) => (p.stock?.[z] ?? 0) > 0;

function recommend(p, a) {
  const rows = sizeRows(p);
  if (!rows || !a?.h || !a?.w) return null;
  const fit = EASE[a.fit] !== undefined ? a.fit : "regular";
  const est = a.chest ? Number(a.chest) : halfIn(estChest(p.gender, a.h, a.w));
  const target = est + EASE[fit];
  let best = rows[0], bd = Infinity;
  for (const r of rows) {
    const d = Math.abs(r.chest - target);
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && r.chest > best.chest)) { best = r; bd = d; } // ties: the larger size
  }
  const i = rows.indexOf(best);
  const edge = i === rows.length - 1 && target > best.chest + 1 ? "snug" : i === 0 && target < best.chest - 1 ? "loose" : null;
  const order = fit === "fitted" ? [rows[i - 1], rows[i + 1]] : [rows[i + 1], rows[i - 1]];
  const alts = inStock(p, best.z) ? [] : order.filter((r) => r && inStock(p, r.z)).map((r) => ({ ...r, roomier: r.chest > best.chest }));
  return { ...best, est, measured: !!a.chest, fit, edge, soldOut: !inStock(p, best.z), alts };
}

const fitName = (k) => (FITS.find((f) => f[0] === k) || FITS[1])[1].toLowerCase();
function why(p, r) {
  const g = p.gender === "men" ? "men's" : "women's";
  return [
    `Based on ${r.measured ? "your" : "an estimated"} chest of ~${fmtIn(r.est)} in and a ${fitName(r.fit)} fit.`,
    r.near ? `${esc(r.z)} isn't on our ${g} chart; we've taken it as one size ${r.dir} ${esc(r.near)} (about ${fmtIn(r.chest)} in).` : `Our size chart lists ${esc(r.z)} at a ${fmtIn(r.chest)} in chest.`,
    r.edge === "snug" ? `It's the largest size in this piece, so it may feel snug.` : r.edge === "loose" ? `It's the smallest size in this piece, so it may feel loose.` : "",
  ].filter(Boolean);
}

// Find the page's own size button and press it, so the product page keeps its own state.
function sizeButton(slotEl, z) {
  const sel = (attr) => `[${attr}="${CSS.escape(z)}"]`;
  if (slotEl?.dataset.context === "quickview") return slotEl.closest(".modal")?.querySelector(sel("data-qv-sz"));
  return slotEl?.closest(".pinfo")?.querySelector(`#sizes ${sel("data-sz")}`) || $(`#sizes ${sel("data-sz")}`);
}
const chosenSize = (slotEl) => {
  const b = slotEl?.dataset.context === "quickview" ? slotEl.closest(".modal")?.querySelector("[data-qv-sz].on") : slotEl?.closest(".pinfo")?.querySelector("#sizes [data-sz].on");
  return b ? b.dataset.sz || b.dataset.qvSz : null;
};
function pickSize(slotEl, z) {
  const b = sizeButton(slotEl, z);
  if (!b || b.disabled) return toast(`${esc(z)} is sold out in this piece`, { icon: "x" });
  b.click();
  b.classList.remove("gd-flash"); void b.offsetWidth; b.classList.add("gd-flash");
  toast(`Size <b>${esc(z)}</b> selected`, { icon: "ruler" });
}

function sizeSlot(el, data) {
  const p = state.byId[data.pid];
  if (!sizeRows(p)) return;
  const quick = data.context === "quickview";
  const box = mount(el, `<div class="gd-fit" data-gd-fit></div>`);
  const render = () => {
    const a = loadFit()[p.gender];
    const r = recommend(p, a);
    if (!r) {
      box.innerHTML = quick ? "" : `<button type="button" class="gd-find" data-gd-open>${icon("ruler", "", 20)}<span><b>Find my size</b><small>Three quick questions: height, weight and fit</small></span>${icon("arrow-right", "", 16)}</button>`;
      return;
    }
    const picked = chosenSize(box) === r.z;
    const alt = r.alts[0];
    box.innerHTML = `<div class="gd-line ${r.soldOut ? "out" : ""}">
      <span class="gd-line-ic">${icon("ruler", "", 18)}</span>
      <div class="gd-line-t"><b>Your size: ${esc(r.z)}</b><small>${r.soldOut ? `Sold out in this piece${alt ? ` · ${esc(alt.z)} is in stock` : ""}` : `${esc(FITS.find((f) => f[0] === r.fit)[1])} fit · ${r.measured ? "" : "est. "}chest ~${fmtIn(r.est)} in`}</small></div>
      ${r.soldOut ? (alt ? `<button type="button" class="btn ghost sm" data-gd-pick="${esc(alt.z)}">Select ${esc(alt.z)}</button>` : "")
        : picked ? `<span class="gd-picked">${icon("check", "", 15)} Selected</span>` : `<button type="button" class="btn rani sm" data-gd-pick="${esc(r.z)}">Select ${esc(r.z)}</button>`}
      ${quick ? "" : `<button type="button" class="link under gd-edit" data-gd-open>edit</button>`}
    </div>`;
  };
  render();
  box.addEventListener("click", (e) => {
    const pk = e.target.closest("[data-gd-pick]");
    if (pk) { pickSize(box, pk.dataset.gdPick); render(); }
    if (e.target.closest("[data-gd-open]")) finder(p, box, render);
  });
  // keep "Selected" honest when the shopper presses a size button themselves
  const sizesRoot = quick ? el.closest(".modal") : el.closest(".pinfo");
  sizesRoot?.addEventListener("click", (e) => { if (e.target.closest("[data-sz],[data-qv-sz]")) setTimeout(render); });
}

function finder(p, slotEl, refresh) {
  const g = p.gender;
  const a = loadFit()[g] || {};
  const heights = Array.from({ length: 80 - 54 + 1 }, (_, k) => 54 + k); // 4'6" to 6'8"
  const el = openOverlay(`<div class="gd-sf">
    <span class="eyebrow">Size finder</span>
    <h3>Find your size <span class="ur">اپنا سائز</span></h3>
    <p class="gd-sf-sub">${g === "men" ? "Men's" : "Women's"} ready to wear · ${esc(p.title)}</p>
    <form class="gd-sf-form" novalidate>
      <div class="row2">
        <div class="field" data-k="h"><label for="gd-h">Height</label><select id="gd-h" name="h"><option value="">Choose</option>${heights.map((n) => `<option value="${n}" ${a.h === n ? "selected" : ""}>${ftIn(n)} · ${Math.round(n * 2.54)} cm</option>`).join("")}</select><span class="msg"></span></div>
        <div class="field" data-k="w"><label for="gd-w">Weight</label><div class="gd-unit"><input id="gd-w" name="w" type="number" inputmode="decimal" min="30" max="200" step="0.5" placeholder="e.g. 60" value="${a.w ? esc(a.w) : ""}"><span>kg</span></div><span class="msg"></span></div>
      </div>
      <fieldset class="gd-fits"><legend>How do you like it to fit?</legend>
        <div class="gd-fit-opts">${FITS.map(([k, label, hint]) => `<label class="gd-fit-opt"><input type="radio" name="fit" value="${k}" ${(a.fit || "regular") === k ? "checked" : ""}><span><b>${label}</b><small>${hint}</small></span></label>`).join("")}</div>
      </fieldset>
      <details class="gd-chest" ${a.chest ? "open" : ""}><summary>${icon("plus", "", 14)} Know your chest measurement? <small>Optional, more accurate</small></summary>
        <div class="field" data-k="chest"><label for="gd-c">Chest (inches)</label><div class="gd-unit"><input id="gd-c" name="chest" type="number" inputmode="decimal" min="24" max="64" step="0.5" placeholder="e.g. 37" value="${a.chest ? esc(a.chest) : ""}"><span>in</span></div><span class="hint">${g === "men" ? "Around the fullest part of the chest" : "Around the fullest part of the bust"}, tape level under the arms, over light clothing.</span><span class="msg"></span></div>
      </details>
      <button class="btn rani block" type="submit">${icon("ruler", "", 16)} Find my size</button>
    </form>
    <div class="gd-result" aria-live="polite"></div>
    <p class="gd-sf-foot">Saved on this device only, so your size shows on other pieces too.${a.h ? ` <button type="button" class="link under" data-gd-forget>Forget my answers</button>` : ""}</p>
  </div>`, { width: 560, cls: "gd-modal" });
  const form = $("form", el), out = $(".gd-result", el);

  const show = (r) => {
    const lines = why(p, r);
    const alt = r.alts.map((x) => `<button type="button" class="btn ghost sm" data-gd-pick="${esc(x.z)}">Select ${esc(x.z)}</button><small>${esc(x.z)} is in stock${x.roomier ? " if you'd like a little more room" : " for a closer fit"}.</small>`).join("");
    out.innerHTML = `<div class="gd-res ${r.soldOut ? "out" : ""}">
      <div class="gd-res-size"><small>Your size</small><b>${esc(r.z)}</b></div>
      <div class="gd-res-why">${lines.map((t, i) => `<p class="${i ? "m" : ""}">${t}</p>`).join("")}
        ${r.measured ? "" : `<p class="m">Height and weight give a rough guide. Add your chest measurement for a closer match.</p>`}</div>
      <div class="gd-res-act">${r.soldOut ? `<p class="gd-out">${icon("clock", "", 15)} ${esc(r.z)} is sold out in this piece right now.</p>${alt ? `<div class="gd-alts">${alt}</div>` : `<p class="m">No nearby size is in stock at the moment.</p>`}`
        : `<button type="button" class="btn rani" data-gd-pick="${esc(r.z)}">${icon("check", "", 16)} Select ${esc(r.z)}</button>`}
        <a class="link under" href="/size-guide" data-link>See the size chart</a></div>
    </div>`;
    out.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  if (a.h && a.w) { const r = recommend(p, a); if (r) show(r); }

  const err = (k, msg) => { const f = $(`.field[data-k="${k}"]`, form); f.classList.toggle("err", !!msg); $(".msg", f).textContent = msg || ""; return !msg; };
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const h = Number(form.h.value), w = Number(form.w.value), c = form.chest.value.trim() ? Number(form.chest.value) : null;
    const ok = [
      err("h", h ? "" : "Please choose your height"),
      err("w", w >= 30 && w <= 200 ? "" : "Enter your weight in kg (30–200)"),
      err("chest", c === null || (c >= 24 && c <= 64) ? "" : "Enter a chest between 24 and 64 inches, or leave it blank"),
    ].every(Boolean);
    if (!ok) return;
    const ans = { h, w, fit: form.fit.value || "regular", ...(c ? { chest: halfIn(c) } : {}), at: Date.now() };
    const all = loadFit(); all[g] = ans; saveFit(all);
    const r = recommend(p, ans);
    if (r) show(r);
    refresh();
  });
  el.addEventListener("click", (e) => {
    const pk = e.target.closest("[data-gd-pick]");
    if (pk) { closeOverlay(); pickSize(slotEl, pk.dataset.gdPick); refresh(); }
    if (e.target.closest("[data-gd-forget]")) {
      const all = loadFit(); delete all[g]; saveFit(all);
      closeOverlay(); refresh(); toast("Your size answers were removed from this device", { icon: "trash-2" });
    }
  });
}

// ================================================================== fabrics
// Season, feel, best uses and care for each fabric family in the catalogue. `is` matches a product's
// exact fabric value (lower case); `scan` finds the fabric in a product's details ("Dupatta: Chiffon").
// `d` ranks how delicate it is: a mixed value such as "Raw Silk & Net" gets the care of its most delicate part.
const GROUPS = [
  { key: "summer", title: "Summer", ur: "گرمیوں کے لیے", sub: "Light, breathable cottons for Pakistan's long, hot months." },
  { key: "winter", title: "Winter", ur: "سردیوں کے لیے", sub: "Heavier weaves that keep you warm from November to February." },
  { key: "allyear", title: "All year", ur: "ہر موسم میں", sub: "Easy-care weaves and blends you can wear in any season." },
  { key: "festive", title: "Festive & formal", ur: "تقریبات کے لیے", sub: "Sheer, lustrous and rich fabrics for Eid, mehndi and shaadi." },
];
const GUIDE = [
  { key: "lawn", group: "summer", name: "Lawn", ur: "لان", d: 1, is: (v) => /\blawn\b/.test(v), scan: /\blawn\b/,
    season: "Summer, March to September", feel: "Fine, light cotton. Crisp when new and softer after washing; pale shades can be slightly sheer.",
    best: "Everyday and office wear in the heat, bright prints and daytime Eid.",
    care: ["Wash in cold water with a mild detergent.", "Wash bright and dark prints separately for the first few washes; the dye can run.", "Dry inside out in the shade so prints don't fade.", "Iron on a cotton setting while slightly damp."],
    short: "cold wash, dry in the shade, iron while damp" },
  { key: "cambric", group: "summer", name: "Cambric", ur: "کیمبرک", d: 1, is: (v) => /cambric/.test(v), scan: /\bcambric\b/,
    season: "Summer into early autumn", feel: "Cotton with a tighter weave than lawn: smooth, a little heavier and less see-through.",
    best: "Trousers and shalwars, everyday shirts and office wear.",
    care: ["Machine wash on a gentle cycle in cold or lukewarm water.", "Wash dark colours separately.", "Dry in the shade.", "Iron on a hot cotton setting."],
    short: "gentle machine wash, iron hot" },
  { key: "cotton", group: "summer", name: "Cotton & poplin", ur: "کاٹن", d: 1, is: (v) => /^(pure |100% )?cotton$|poplin/.test(v),
    season: "Most of the year; lighter weights for summer", feel: "Soft, breathable and easy to wear. Poplin is a tightly woven cotton or cotton blend with a smooth, crisp finish.",
    best: "Everyday kameez, office and casual wear.",
    care: ["Machine wash on a gentle cycle, cold or lukewarm.", "Hot water can shrink cotton a little; keep washes cool.", "Wash dark colours separately and dry in the shade.", "Iron on a cotton setting, ideally while slightly damp."],
    short: "cool machine wash, iron on cotton" },
  { key: "dobby", group: "summer", name: "Dobby", ur: "ڈوبی", d: 1, is: (v) => /dobby/.test(v), scan: /\bdobby\b/,
    season: "Spring and summer", feel: "A woven fabric, usually cotton, with a small raised pattern such as dots, checks or stripes woven in. Breathable with a light texture.",
    best: "Everyday and semi-formal kameez, men's kurtas.",
    care: ["Wash in cold or lukewarm water on a gentle cycle.", "Turn inside out to protect the woven texture.", "Dry in the shade.", "Iron on the reverse at a medium-hot setting."],
    short: "gentle wash inside out, iron on the reverse" },
  { key: "khaddar", group: "winter", name: "Khaddar", ur: "کھدر", d: 2, is: (v) => /khadd?ar/.test(v), scan: /\bkhadd?ar\b/,
    season: "Winter; light khaddar suits autumn and mild days", feel: "A thick, textured cotton weave with a homespun feel. Slub khaddar uses uneven yarns for a nubby look; light khaddar is a thinner version.",
    best: "Everyday winter wear, prints and embroidery.",
    care: ["Wash in cold water, separately at first; deep colours can bleed.", "Khaddar can shrink a little, so avoid hot water and tumble drying.", "Dry in the shade.", "Iron inside out on a hot cotton setting.", "Unstitched? Ask your darzi whether to pre-wash it before cutting."],
    short: "cold wash, no hot water or tumble dryer" },
  { key: "karandi", group: "winter", name: "Karandi", ur: "کرنڈی", d: 3, is: (v) => /karandi/.test(v), scan: /\bkarandi\b/,
    season: "Winter", feel: "A medium-weight winter weave with a slightly rough, crinkled texture. Usually a blend; it drapes well and holds prints and embroidery nicely.",
    best: "Winter daywear and smart-casual looks in the cold months.",
    care: ["Hand wash in cold water, or dry clean.", "Don't wring or twist; press the water out gently.", "Dry in the shade.", "Iron on the reverse at a medium setting."],
    short: "cold hand wash or dry clean, no wringing" },
  { key: "marina", group: "winter", name: "Marina", ur: "مرینا", d: 2, is: (v) => /marina/.test(v), scan: /\bmarina\b/,
    season: "Winter", feel: "A soft, warm winter fabric with a smooth, thick feel. Usually a blend, and it creases less than cotton.",
    best: "Casual and everyday winter wear.",
    care: ["Hand wash or use a delicate cycle in cold water.", "Don't wring; dry in the shade.", "Iron on a low to medium setting; blends don't like high heat."],
    short: "cold delicate wash, low iron" },
  { key: "linen", group: "winter", name: "Linen", ur: "لینن", d: 2, is: (v) => /linen/.test(v), scan: /\blinen\b/,
    season: "Autumn and winter in Pakistani collections", feel: "Pakistani brands sell \"linen\" mostly in winter ranges: a mid-weight, linen-look weave, often a blend, softer and warmer than classic summer linen.",
    best: "Winter daywear and prints.",
    care: ["Wash gently in cold water.", "Dry in the shade; don't tumble dry.", "Iron on the reverse at a medium setting while slightly damp."],
    short: "gentle cold wash, no tumble dryer" },
  { key: "washwear", group: "allyear", name: "Wash & wear", ur: "واش اینڈ ویئر", d: 1, is: (v) => /wash\s*(&|and)\s*wear/.test(v),
    season: "All year", feel: "Smooth, light men's suiting, usually polyester blended with cotton or viscose. It resists creases and dries quickly.",
    best: "Office, travel and everyday kameez shalwar.",
    care: ["Machine wash in cold or lukewarm water.", "Hang it up to dry straight away and most creases fall out.", "Iron on a low to medium setting; high heat can leave a shine."],
    short: "machine wash, hang to dry, low iron" },
  { key: "viscose", group: "allyear", name: "Viscose", ur: "وسکوز", d: 3, is: (v) => /viscose|rayon/.test(v), scan: /\bviscose\b/,
    season: "All year", feel: "A soft, smooth fibre made from plant cellulose. It drapes and breathes well, but it is weaker when wet.",
    best: "Relaxed kurtas and co-ord sets.",
    care: ["Hand wash in cold water or use a delicate cycle; warm water can shrink it.", "Don't wring or twist.", "Dry on a hanger in the shade.", "Iron inside out at a medium setting."],
    short: "cold hand wash, no wringing" },
  { key: "crepe", group: "allyear", name: "Crepe", ur: "کریپ", d: 3, is: (v) => /crepe/.test(v), scan: /\bcrepe\b/,
    season: "All year; heavier crepes for winter", feel: "Soft, with a fine pebbled surface. It drapes beautifully and resists creases.",
    best: "Flowing shirts, trousers and evening wear.",
    care: ["Hand wash in cold water, or dry clean; warm water can shrink crepe.", "Don't wring; dry flat in the shade.", "Iron on the reverse at a low setting with a cloth on top."],
    short: "cold hand wash or dry clean" },
  { key: "blends", group: "allyear", name: "Blends & brand weaves", ur: "مکس کپڑے", d: 1, is: (v) => /^blended$|^blend$|grip|irish|filament/.test(v),
    season: "Mostly all year", feel: "Some pieces are listed as \"Blended\" or under a brand's own weave name, such as Grip, Irish or Cotton Filament. The fibre mix varies by maker, so the care label inside is the best guide.",
    best: "Easy everyday and office wear.",
    care: ["Follow the care label first.", "If in doubt, wash cold on a gentle cycle and dry in the shade.", "Iron on a low to medium setting; many blends contain synthetic fibres that don't like high heat."],
    short: "follow the care label" },
  { key: "satin", group: "festive", name: "Cotton satin", ur: "کاٹن ساٹن", d: 3, is: (v) => /satin|sateen/.test(v), scan: /\bsatin\b/,
    season: "Autumn to spring; festive daywear", feel: "Cotton woven in a satin weave: smooth and soft, with a gentle sheen on the face.",
    best: "Festive daywear, Eid and dinners.",
    care: ["Hand wash or use a gentle cycle in cold water, inside out.", "Don't wring; dry in the shade.", "Iron on the reverse at a medium setting to protect the sheen."],
    short: "cold gentle wash inside out" },
  { key: "cottonsilk", group: "festive", name: "Cotton silk", ur: "کاٹن سلک", d: 3, is: (v) => /cotton silk/.test(v), scan: /\bcotton silk\b/,
    season: "All year; semi-formal", feel: "A cotton and silk mix: lighter and more breathable than pure silk, with a soft lustre.",
    best: "Semi-formal and festive daywear.",
    care: ["Dry clean, or hand wash gently in cold water.", "Don't wring; dry in the shade.", "Iron on the reverse at a low to medium setting."],
    short: "dry clean or gentle cold hand wash" },
  { key: "jacquard", group: "festive", name: "Jacquard", ur: "جیکارڈ", d: 3, is: (v) => /jacquard/.test(v), scan: /\bjacquard\b/,
    season: "Autumn to spring", feel: "The pattern is woven into the cloth on a jacquard loom, not printed, so it shows on both sides. Rich, textured and medium to heavy.",
    best: "Festive and formal wear, statement shirts.",
    care: ["Dry clean, or hand wash gently in cold water.", "Turn inside out so the woven threads don't snag.", "Iron on the reverse at a low to medium setting."],
    short: "dry clean or gentle cold hand wash" },
  { key: "rawsilk", group: "festive", name: "Raw silk", ur: "را سلک", d: 4, is: (v) => /raw silk/.test(v), scan: /\braw silk\b/,
    season: "Autumn and winter; weddings all year", feel: "A structured fabric with a nubby, slubbed texture and a soft sheen. It holds its shape, so it suits heavy embroidery. Blended or \"poly\" raw silk mixes in synthetic fibre.",
    best: "Weddings, mehndi, Eid and formal shalwars.",
    care: ["Dry cleaning is safest.", "Don't soak or wring; water can leave marks on silk.", "Iron on the reverse at a low silk setting, with a cloth on top.", "Store in a cotton bag, away from damp."],
    short: "dry clean, low iron with a cloth" },
  { key: "silk", group: "festive", name: "Silk", ur: "ریشم", d: 4, is: (v) => /silk/.test(v) && !/raw silk|cotton silk/.test(v), scan: /(?<!raw |cotton )\bsilk\b/,
    season: "All year for formal wear", feel: "Smooth, lustrous and fluid, with a beautiful drape.",
    best: "Formal events, Eid and dinners.",
    care: ["Dry cleaning is safest; otherwise hand wash in cold water with a gentle detergent.", "Don't wring; roll it in a towel to remove water.", "Dry in the shade; sunlight fades silk.", "Iron on the reverse at a low silk setting."],
    short: "dry clean or cold hand wash, low iron" },
  { key: "chiffon", group: "festive", name: "Chiffon", ur: "شیفون", d: 4, is: (v) => /chiffon/.test(v), scan: /\bchiffon\b/,
    season: "All year; a summer favourite for formals", feel: "Sheer, very light and floaty. Usually polyester; silk chiffon is softer and costlier.",
    best: "Dupattas, formal shirts and layered festive looks.",
    care: ["Dry clean, or hand wash gently in cold water.", "Never wring it or scrub the embroidery.", "Dry flat or on a padded hanger in the shade.", "Iron on low with a cloth on top."],
    short: "dry clean or gentle cold hand wash" },
  { key: "georgette", group: "festive", name: "Georgette", ur: "جارجٹ", d: 4, is: (v) => /georgette/.test(v), scan: /\bgeorgette\b/,
    season: "All year; formal", feel: "Sheer and flowing with a slightly grainy, crinkled surface. A little heavier and less slippery than chiffon, and usually worn with a slip.",
    best: "Formal shirts, festive kurtas and dupattas.",
    care: ["Dry clean, or hand wash gently in cold water.", "Don't wring; dry flat in the shade.", "Iron on the reverse at a low setting with a cloth on top."],
    short: "dry clean or gentle cold hand wash" },
  { key: "organza", group: "festive", name: "Organza", ur: "آرگنزا", d: 5, is: (v) => /organza/.test(v), scan: /\borganza\b/,
    season: "All year; formal and bridal", feel: "Sheer, crisp and light, with a stiff body that holds its shape. Usually silk or polyester.",
    best: "Formal and bridal wear, sleeves, borders and dupattas.",
    care: ["Dry cleaning is recommended.", "Iron on a very low setting with a cloth on top; high heat can scorch or melt it.", "Hang it or roll it in tissue to avoid sharp creases."],
    short: "dry clean, very low iron" },
  { key: "net", group: "festive", name: "Net", ur: "نیٹ", d: 5, is: (v) => /\bnet\b/.test(v), scan: /\bnet\b/,
    season: "All year; formal", feel: "An open, mesh-like fabric: light and airy, usually embroidered and worn over a slip.",
    best: "Formal and wedding shirts, embroidered dupattas.",
    care: ["Dry clean, especially when it is embellished.", "Keep it away from rough jewellery and zips; net snags easily.", "If it needs pressing, iron on low on the reverse with a cloth on top."],
    short: "dry clean, watch for snags" },
  { key: "velvet", group: "festive", name: "Velvet", ur: "مخمل", d: 5, is: (v) => /velvet/.test(v), scan: /\bvelvet\b/,
    season: "Winter", feel: "A thick, soft pile with a deep, rich sheen. Warm and heavy.",
    best: "Winter weddings, formal shirts and shalwars.",
    care: ["Dry clean only.", "Never iron the pile directly; steam it gently from the reverse.", "Hang it up; folding and pressure crush the pile.", "Lift flattened pile with a soft brush."],
    short: "dry clean only, steam, never iron the pile" },
];
const BLENDS = GUIDE.find((f) => f.key === "blends");
const lc = (v) => String(v || "").toLowerCase().trim();
// Every guide entry a fabric value belongs to; values we don't know yet fall back to the blends advice.
const entriesFor = (v) => { const hits = GUIDE.filter((f) => f.is(lc(v))); return hits.length ? hits : [BLENDS]; };
const careEntry = (v) => entriesFor(v).sort((a, b) => b.d - a.d)[0];
// Exactly what /shop lists (listed pieces with photos), so the counts match the shop page.
const shopPieces = () => listed().filter((p) => p.category !== "giftcard" && p.images?.length && p.fabric);

function careSlot(el, data) {
  const p = state.byId[data.pid];
  if (!p || p.category === "giftcard" || !p.fabric) return;
  const f = careEntry(p.fabric);
  const own = new Set(entriesFor(p.fabric));
  const text = lc((p.details || []).join(" | "));
  const also = GUIDE.filter((x) => x.scan && !own.has(x) && x.scan.test(text)).slice(0, 3);
  mount(el, `<details class="acc gd-care"><summary>Wash & care · ${esc(p.fabric)} ${icon("plus", "", 16)}</summary><div class="body">
    <p class="gd-care-meta"><span class="gd-pill">${esc(f.season)}</span><span>${esc(f.feel)}</span></p>
    <ul>${f.care.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
    ${also.length ? `<p class="gd-also"><b>Also in this set</b>${also.map((x) => `<span>${esc(x.name)}: ${esc(x.short)}</span>`).join("")}</p>` : ""}
    <a class="link under gd-care-link" href="/fabric-guide" data-link>The full fabric guide ${icon("arrow-right", "", 14)}</a>
  </div></details>`);
}

// ================================================================== /fabric-guide
function page(view) {
  const pieces = shopPieces();
  const counts = new Map();
  for (const p of pieces) counts.set(p.fabric, (counts.get(p.fabric) || 0) + 1);
  const values = new Map(GUIDE.map((f) => [f, []]));
  for (const [v, n] of counts) for (const f of entriesFor(v)) values.get(f).push([v, n]);
  const thumbs = (f) => pieces.filter((p) => entriesFor(p.fabric).includes(f)).sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 3);
  const wa = state.store?.contact?.whatsapp;

  const fabricCard = (f, i) => {
    const vals = values.get(f).sort((a, b) => b[1] - a[1]);
    const total = vals.reduce((s, [, n]) => s + n, 0);
    const pics = thumbs(f);
    return `<article class="gd-fab" id="fabric-${f.key}" data-reveal style="--i:${i % 3}">
      <header><div><h3>${esc(f.name)}</h3><span class="ur">${esc(f.ur)}</span></div><span class="gd-pill">${esc(f.season)}</span></header>
      ${pics.length ? `<div class="gd-thumbs">${pics.map((p) => `<a href="/product/${esc(p.slug)}" data-link title="${esc(p.title)}"><img src="${esc(img(p.images[0]))}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer"></a>`).join("")}</div>` : ""}
      <dl class="gd-facts"><div><dt>How it feels</dt><dd>${esc(f.feel)}</dd></div><div><dt>Best for</dt><dd>${esc(f.best)}</dd></div></dl>
      <div class="gd-fab-care"><h4>${icon("sparkles", "", 14)} Care</h4><ul>${f.care.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>
      <footer class="gd-shop">${total ? vals.filter(([, n]) => n > 0).map(([v, n]) => `<a class="chip" href="/shop?fabric=${encodeURIComponent(v)}" data-link>${esc(v)} <b>${plural(n, "piece")}</b>${icon("arrow-right", "", 14)}</a>`).join("") : `<span class="gd-none">None in the shop right now</span>`}</footer>
    </article>`;
  };

  view.innerHTML = `<section class="phero gd-hero"><span class="eyebrow">Fabric guide</span><h1 style="margin-top:12px">Fabric <em>guide</em></h1><div class="urdu">کپڑوں کی پہچان</div>
      <p>Lawn for June, khaddar for December. What each fabric in our shop feels like, when to wear it and how to keep it looking new.</p>
      <nav class="gd-jump" aria-label="Jump to a season">${GROUPS.map((g) => `<button type="button" class="chip" data-gd-jump="${g.key}">${esc(g.title)}</button>`).join("")}</nav></section>
    <section class="wrap gd-rules" aria-label="Care basics">${[
      ["sparkles", "Colours first", "Wash new, bright or dark pieces on their own for the first few washes."],
      ["leaf", "Shade, not sun", "Dry in the shade. Strong sun fades prints and dyes."],
      ["shirt", "Iron inside out", "Press printed and embroidered pieces on the reverse."],
      ["gem", "Formals to the cleaner", "Silk, velvet, organza, net and heavy embroidery are safest dry cleaned."],
    ].map(([ic, t, d], i) => `<div class="gd-rule" data-reveal style="--i:${i}"><span class="gd-rule-ic">${icon(ic, "", 18)}</span><div><b>${t}</b><p>${d}</p></div></div>`).join("")}</section>
    ${GROUPS.map((g) => {
      const list = GUIDE.filter((f) => f.group === g.key);
      return `<section class="wrap gd-group g-${g.key}" id="gd-${g.key}">
        <div class="gd-group-head"><div><span class="eyebrow">${plural(list.length, "fabric")}</span><h2>${esc(g.title)} <span class="ur">${esc(g.ur)}</span></h2></div><p>${esc(g.sub)}</p></div>
        <div class="gd-grid">${list.map(fabricCard).join("")}</div></section>`;
    }).join("")}
    <section class="wrap gd-help"><div class="gd-help-in" data-reveal><div><span class="eyebrow">Still deciding?</span><h2>We'll help you <em>choose</em></h2><p>Tell us the occasion and the season, and we'll suggest a fabric and a size. A real person replies on WhatsApp.</p></div>
      <div class="gd-help-cta">${wa ? `<a class="btn wa" href="https://wa.me/${esc(wa)}?text=${encodeURIComponent("Assalam o Alaikum Aarzu! Can you help me choose a fabric?")}" target="_blank" rel="noopener">${icon("whatsapp", "", 18)} Ask on WhatsApp</a>` : ""}<a class="btn ghost" href="/size-guide" data-link>${icon("ruler", "", 16)} Size guide</a></div></div></section>`;

  view.addEventListener("click", (e) => {
    const j = e.target.closest("[data-gd-jump]");
    if (j) $(`#gd-${j.dataset.gdJump}`, view)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  // Brand photos can fail to load: drop the broken thumbnail rather than show an empty frame.
  $$(".gd-thumbs img", view).forEach((im) => {
    const bad = () => { const a = im.closest("a"), row = a?.parentElement; a?.remove(); if (row && !row.children.length) row.remove(); };
    im.addEventListener("error", bad, { once: true });
    if (im.complete && !im.naturalWidth) bad();
  });
}

export async function init() {
  registerRoute(/^\/fabric-guide\/?$/, page);
  registerLink({ where: "help", label: "Fabric guide", href: "/fabric-guide" });
  registerSlot("pdp-options", sizeSlot);
  registerSlot("pdp-after", careSlot);
}
