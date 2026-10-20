// Import the supplied Azmat CSV without changing storefront layouts.
// Usage: node scripts/import-azmat.mjs [path/to/file.csv]
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(v => v !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV field");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift();
  if (!header?.includes("New Name") || !header.includes("Source Product ID")) throw new Error("Unexpected CSV columns");
  return rows.map((values, i) => {
    if (values.length !== header.length) throw new Error("Invalid CSV row " + (i + 2));
    return Object.fromEntries(header.map((key, j) => [key, values[j]]));
  });
}

const brands = /\b(?:celts|yards|shaista|mahnur|tawakkal|omre|ayleen|kissa|sanam\s*saeed|azmat\s*brothers)\b/gi;
function cleanDescription(text) {
  return String(text).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/If you would like, I can help you with:[\s\S]*/i, "")
    .replace(/^AURA BY CELTS[\s\S]*?(?=This beautifully crafted)/i, "")
    .replace(/^DEHLEEZ BY CELTS[\s\S]*?(?=This|A beautifully|An elegant)/i, "")
    .replace(/^OMRE VOL\.\s*\d+\s*Product Description:\s*/i, "")
    .replace(/\*?\s*(?:Collection|Brand)\s*:\s*[^.]*?(?=Care Instructions|Disclaimer|$)/gi, " ")
    .replace(brands, (name, offset, source) => /^yards$/i.test(name) && /\d(?:\.\d+)?\s*$/.test(source.slice(0, offset)) ? "yards" : "").replace(/\bby\s+(?=[.,;]|$)/gi, "")
    .replace(/^\s*(?:Description\s*:?\s*)+/i, "").replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
}
function fabricOf(text) {
  const shirt = String(text).split(/(?:Dupp?atta|Shawl)\s*:/i)[0];
  const choices = [
    [/italian wool/i, "Italian Wool"], [/EMB FRONT ORGANZA/i, "Organza"],
    [/corduroy/i, "Corduroy"], [/viscose slub/i, "Viscose Slub"], [/winter slub/i, "Winter Slub"],
    [/dhanak/i, "Dhanak"], [/khaddar/i, "Khaddar"], [/karandi/i, "Karandi"], [/peach/i, "Peach"],
    [/lawn/i, "Lawn"], [/cotton/i, "Cotton"], [/linen/i, "Linen"], [/silk/i, "Silk"]
  ];
  return choices.find(([re]) => re.test(shirt))?.[1] || "Embroidered Fabric";
}
function imageUrls(row) {
  const urls = [row["Main Image URL"], ...row["All Image URLs"].split(/\s*\|\s*/)];
  return [...new Set(urls.filter(Boolean))].map(url => {
    if (!/^https:\/\/cdn\.shopify\.com\//i.test(url)) throw new Error("Unexpected image URL for " + row["New Name"]);
    return url;
  });
}
export function buildCatalog(rows) {
  const products = [], excluded = [], ids = new Set(), slugs = new Set();
  for (const row of rows) {
    if (/sanam[\s_-]*saeed/i.test(JSON.stringify(row))) { excluded.push(row["New Name"]); continue; }
    const title = row["New Name"].trim(), sourceId = row["Source Product ID"].trim();
    const price = Number(row["Price (PKR)"]);
    if (!title || !/^\d+$/.test(sourceId) || !Number.isInteger(price) || price <= 1000) throw new Error("Invalid product: " + title);
    if (!["Available", "Sold out"].includes(row.Availability)) throw new Error("Unknown availability: " + title);
    const id = "AZ-AB-" + sourceId, slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (ids.has(id) || slugs.has(slug)) throw new Error("Duplicate product: " + title);
    ids.add(id); slugs.add(slug);
    const images = imageUrls(row), description = cleanDescription(row["Original Description"]);
    if (!images.length || !description) throw new Error("Missing image or description: " + title);
    const importedAt = new Date(row["Retrieved At (UTC)"]).toISOString();
    products.push({
      id, slug, title, urdu: "آرزو", collection: "designer", gender: "women", category: "unstitched",
      pieces: 3, fabric: fabricOf(row["Original Description"]), colors: [],
      occasions: /festive|formal|luxury/i.test(row["Original Description"]) ? ["Festive"] : ["Everyday"],
      region: null, motif: null, price: price - 1000, compareAt: price, images, description,
      details: ["3-piece unstitched suit", "Includes shirt, dupatta or shawl, and trouser fabric", "Stitching is not included"],
      sizes: ["Unstitched"], stock: { Unstitched: row.Availability === "Available" ? 1 : 0 },
      swatch: null, createdAt: new Date(Date.parse(importedAt) - Number(row.Number) * 60000).toISOString(),
      source: {
        supplier: "Azmat Brothers", brand: row["Original Product Name"].split(/\s+-\s+/)[0].trim(),
        originalName: row["Original Product Name"], url: row["Product URL"], sku: row.SKU || null,
        productId: sourceId, price, originalPrice: row["Original Compare-at Price (PKR)"] ? Number(row["Original Compare-at Price (PKR)"]) : null,
        importedAt, availability: row.Availability, stockFromAvailability: true, row: Number(row.Number)
      }
    });
  }
  return { products, excluded };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] || "shalwar_kameez_100.csv";
  const result = buildCatalog(parseCsv(fs.readFileSync(file, "utf8")));
  const root = new URL("../", import.meta.url);
  fs.writeFileSync(new URL("data/catalog.brands.json", root), JSON.stringify(result.products, null, 2) + "\n");
  fs.writeFileSync(new URL("data/originals.json", root), "[]\n");
  console.log("Imported " + result.products.length + " products; excluded " + result.excluded.length + ". Existing runtime orders and stock overrides were preserved.");
}
