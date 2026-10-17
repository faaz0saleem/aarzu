// Turns raw brand product data (from the scraper or a Cowork JSON export) into
// Aarzu listings: Aarzu-style name, price = brand price − 1000, and a description
// with the source brand mentioned once, in the middle sentence.
import crypto from "node:crypto";

export const DISCOUNT = 1000;

const BRANDS = ["Khaadi", "Sana Safinaz", "Limelight", "Sapphire", "Gul Ahmed", "Ideas", "Maria B", "Maria.B", "Alkaram", "Alkaram Studio", "Junaid Jamshed", "J\\.", "Edenrobe", "Bonanza Satrangi", "Bonanza", "Satrangi", "Nishat Linen", "Nishat", "Beechtree", "Zellbury", "Amir Adnan", "Mahay", "Muzlin"];
const NAMES = [["Mehtab", "مہتاب"], ["Gulnaar", "گلنار"], ["Noor", "نور"], ["Zeenat", "زینت"], ["Saba", "صبا"], ["Sitara", "ستارہ"], ["Chandni", "چاندنی"], ["Shirin", "شیریں"], ["Gulrang", "گل رنگ"], ["Rangoli", "رنگولی"], ["Jugnu", "جگنو"], ["Mehr", "مہر"], ["Shafaq", "شفق"], ["Kahkashan", "کہکشاں"], ["Bahar", "بہار"], ["Naz", "ناز"], ["Rimjhim", "رم جھم"], ["Nargis", "نرگس"], ["Yasmin", "یاسمین"], ["Sehar", "سحر"], ["Dhanak", "دھنک"], ["Hina", "حنا"], ["Gulab", "گلاب"], ["Zarnigar", "زرنگار"], ["Mahjabeen", "مہ جبین"], ["Nazakat", "نزاکت"], ["Laali", "لالی"], ["Afshan", "افشاں"], ["Roshan", "روشن"], ["Shehzadi", "شہزادی"], ["Kashish", "کشش"], ["Ada", "ادا"], ["Tabassum", "تبسم"], ["Inaya", "عنایہ"], ["Mahnoor", "ماہ نور"], ["Neelam", "نیلم"], ["Firoza", "فیروزہ"], ["Marjan", "مرجان"], ["Zumurd", "زمرد"], ["Aqeeq", "عقیق"]];
const MEN_NAMES = [["Shahzaib", "شاہ زیب"], ["Sardar", "سردار"], ["Nawab", "نواب"], ["Darya", "دریا"], ["Kohsar", "کوہسار"], ["Sultan", "سلطان"], ["Shaheen", "شاہین"], ["Taimur", "تیمور"], ["Rehbar", "رہبر"], ["Safeer", "سفیر"], ["Zaviyar", "زاویار"], ["Arsalan", "ارسلان"], ["Danish", "دانش"], ["Fateh", "فاتح"], ["Jahan", "جہاں"], ["Raees", "رئیس"], ["Wajid", "واجد"], ["Behram", "بہرام"], ["Imran", "عمران"], ["Saqib", "ثاقب"], ["Hamza", "حمزہ"], ["Zarrar", "ضرار"], ["Nadir", "نادر"], ["Azlan", "ازلان"]];
const FABRICS = ["Lawn", "Cambric", "Khaddar", "Karandi", "Linen", "Chiffon", "Silk", "Raw Silk", "Organza", "Jacquard", "Cotton", "Velvet", "Marina", "Wash & Wear", "Boski", "Viscose", "Net", "Dobby", "Slub", "Cotton Satin", "Lawn Cotton", "Yarn Dyed", "Wool"];

const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const brandRe = (extra) => new RegExp(`\\b(${[...BRANDS, extra && extra.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")].filter(Boolean).join("|")})('s)?\\b`, "gi");
export const stripHtml = (h) => String(h || "").replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
const scrub = (t, brand) => String(t || "").replace(brandRe(brand), "").replace(/\b[A-Z]{1,5}[-\s]?\d{2,}[-A-Z0-9]*\b/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
const titleCase = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function guessFabric(text) {
  const t = String(text || "").toLowerCase();
  return FABRICS.slice().sort((a, b) => b.length - a.length).find((f) => t.includes(f.toLowerCase())) || null;
}
export function guessPieces(text) {
  const m = String(text || "").match(/(\d)\s*-?\s*(pc|pcs|piece|pieces)\b/i);
  return m ? Number(m[1]) : null;
}

function occasionsFor(r, text) {
  const t = text.toLowerCase();
  const o = new Set();
  if (/eid|festive|luxe|luxury|formal|wedding|chiffon|organza|silk|velvet|embellish|sequin/.test(t)) o.add("Eid");
  if (/formal|luxe|luxury|wedding|organza|velvet|sequin|embellish/.test(t)) o.add("Wedding Guest");
  if (/mehndi|yellow|mustard|haldi/.test(t)) o.add("Mehndi");
  if (r.gender === "men" && /white|wash|cotton|boski/.test(t)) o.add("Jummah");
  if (r.gender === "men" && /wash & wear|wash and wear|navy|grey|gray/.test(t)) o.add("Office");
  if (!o.size || /lawn|cambric|printed|everyday|basic|daily/.test(t)) o.add("Everyday");
  return [...o];
}

export function transform(rows, { now = Date.now() } = {}) {
  const used = new Set();
  const out = [];
  const warnings = [];
  rows.forEach((r, i) => {
    const price = Math.round(Number(String(r.price_pkr ?? r.price ?? "").replace(/[^\d.]/g, "")));
    const images = [].concat(r.images || []).filter((u) => /^https?:\/\//.test(u));
    if (!r.brand || !r.name || !price || !images.length) return warnings.push(`skipped #${i + 1} (${r.name || "no name"}): missing brand/name/price/images`);
    if (price - DISCOUNT < 500) return warnings.push(`skipped ${r.name}: price ${price} too low for the Rs ${DISCOUNT} discount`);
    const gender = /^m(en|ale)?$/i.test(String(r.gender)) ? "men" : "women";
    const all = [r.name, r.description, (r.details || []).join(" "), r.collection, r.fabric].join(" ");
    const type = /unstitch/i.test(String(r.type) + " " + r.name) ? "unstitched" : "ready-to-wear";
    const pieces = Number(r.pieces) || guessPieces(all) || (type === "unstitched" ? 3 : 2);
    const fabric = titleCase(r.fabric || guessFabric(all) || (gender === "men" ? "Cotton" : "Lawn")).replace("Wash & Wear", "Wash & Wear");
    const deco = /embroider/i.test(all) ? "Embroidered" : /print/i.test(all) ? "Printed" : /jacquard/i.test(all) ? "Jacquard" : /dyed|solid|plain/i.test(all) ? "Solid" : null;
    const key = hash(r.url || r.name);
    const pool = gender === "men" ? MEN_NAMES : NAMES;
    let k = parseInt(key.slice(0, 8), 16) % pool.length, tries = 0;
    while (used.has(pool[k][0]) && tries++ < pool.length) k = (k + 1) % pool.length;
    const [nm, ur] = pool[k];
    used.add(nm);
    const descriptor = gender === "men" ? `${deco && deco !== "Solid" ? deco + " " : ""}${fabric} Kameez Shalwar` : `${deco ? deco + " " : ""}${fabric} ${pieces}-Piece`;
    const colors = String(r.color || "").split(/[\/,&]| and /i).map((c) => titleCase(c.trim())).filter(Boolean).slice(0, 3);
    const brand = String(r.brand).trim();

    // Description: lead sentence, brand sentence in the middle, styling note.
    const raw = scrub(stripHtml(r.description).split("\n").filter((l) => !/:\s/.test(l) || l.length > 90).join(" "), brand);
    const firstBits = raw.split(/(?<=[.!?])\s+/).filter((x) => x.length > 25).slice(0, 2).join(" ");
    const lead = /^[A-Z]/.test(firstBits) ? firstBits : `A ${colors[0] ? colors[0].toLowerCase() + " " : ""}${fabric.toLowerCase()} ${type === "unstitched" ? "unstitched " : ""}${gender === "men" ? "kameez shalwar" : `${pieces}-piece suit`}${deco ? ` with ${deco.toLowerCase()} detailing` : ""}.`;
    const middle = `This piece comes from ${brand}'s ${r.collection ? scrub(r.collection, "") + " " : ""}collection and reaches you quality-checked by the Aarzu team.`;
    const close = type === "unstitched" ? "Take it to your darzi for a fit that's completely yours." : gender === "men" ? "Pair it with a waistcoat or a shawl for the evening." : "Finish it with a contrast dupatta from our Complete the Look edit.";
    const details = [].concat(r.details || []).map((d) => scrub(stripHtml(d), brand)).filter((d) => d.length > 3).slice(0, 8);
    const sizes = type === "unstitched" ? ["Unstitched"] : (r.sizes?.length ? r.sizes.map(String) : gender === "men" ? ["S", "M", "L", "XL"] : ["XS", "S", "M", "L", "XL"]);
    out.push({
      id: `AZ-D${key.slice(0, 7).toUpperCase()}`,
      slug: `${nm}-${descriptor}-${key.slice(0, 4)}`.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      title: `${nm} · ${descriptor}`,
      urdu: ur,
      collection: "designer",
      gender,
      category: type,
      pieces,
      fabric,
      colors: colors.length ? colors : ["Multi"],
      occasions: occasionsFor({ gender }, all),
      region: null,
      motif: null,
      price: price - DISCOUNT,
      compareAt: price,
      images: images.slice(0, 5),
      description: `${lead} ${middle} ${close}`,
      details: details.length ? details : [type === "unstitched" ? `${pieces}-piece unstitched fabric` : `${pieces}-piece ready to wear`, `Fabric: ${fabric}`],
      sizes,
      stock: Object.fromEntries(sizes.map((s) => [s, r.in_stock === false ? 0 : 10])),
      swatch: null,
      createdAt: new Date(now - i * 60000).toISOString(),
      source: { brand, url: r.url, sku: r.sku || null, price, originalPrice: r.original_price_pkr || null, importedAt: new Date(now).toISOString() },
    });
  });
  return { products: out, warnings };
}

// Accepts pasted text: JSON arrays, possibly inside ``` fences with "PART 1/4" labels.
export function parsePasted(text) {
  const rows = [];
  const cleaned = String(text).replace(/```(json)?/gi, "\n");
  let depth = 0, start = -1, inStr = false, escp = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) { if (escp) escp = false; else if (c === "\\") escp = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[") { if (depth++ === 0) start = i; }
    else if (c === "]" && depth > 0 && --depth === 0) {
      try {
        const arr = JSON.parse(cleaned.slice(start, i + 1));
        if (Array.isArray(arr) && arr.some((x) => x && typeof x === "object" && (x.name || x.url))) rows.push(...arr);
      } catch {}
    }
  }
  return rows;
}
