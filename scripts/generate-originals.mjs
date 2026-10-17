// Writes the Aarzu Originals + accessories catalogue records to data/originals.json.
// Photos are picked up at runtime from public/images/originals/photos/<slug>.jpg
// (add <slug>-2.jpg, <slug>-3.jpg for more angles). Run: npm run generate
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGINALS, ACCESSORIES } from "./designs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W_SIZES = ["XS", "S", "M", "L", "XL"];
const M_SIZES = ["S", "M", "L", "XL", "XXL"];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function stockFor(seed, sizes) {
  const r = rng(seed * 7 + 3);
  return Object.fromEntries(sizes.map((s) => [s, 8 + Math.floor(r() * 22)]));
}

const created = new Date("2026-10-01T09:00:00+05:00").getTime();
const products = [];

ORIGINALS.forEach((d, i) => {
  const sizes = d.type === "unstitched" ? ["Unstitched"] : d.gender === "men" ? M_SIZES : W_SIZES;
  products.push({
    id: `AZ-O${String(i + 1).padStart(2, "0")}`,
    slug: d.slug, title: d.name, urdu: d.urdu, collection: "originals",
    gender: d.gender, category: d.type, pieces: d.pieces, fabric: d.fabric,
    colors: d.colors, occasions: d.occasions, region: d.region, motif: d.motif,
    price: d.price, compareAt: null, images: [],
    description: d.story, details: d.details, sizes, stock: stockFor(d.seed, sizes),
    swatch: d.palette.base, createdAt: new Date(created + i * 3600e3).toISOString(),
  });
});

ACCESSORIES.forEach((a, i) => {
  products.push({
    id: `AZ-A${String(i + 1).padStart(2, "0")}`,
    slug: a.slug, title: a.name, urdu: a.urdu, collection: "originals",
    gender: a.gender, category: "accessory", accessoryType: a.kind === "stole" ? "scarf" : a.kind,
    pieces: 1, fabric: a.material, colors: a.colors, occasions: ["Everyday"], region: a.region, motif: null,
    price: a.price, compareAt: null, images: [],
    description: a.story,
    details: [`Material: ${a.material}`, a.kind === "shawl" ? "Size: approx. 2.5 m × 1.2 m" : a.kind === "stole" ? "Size: approx. 2 m × 0.7 m" : "Size: approx. 2.5 m × 1.1 m", "Finish: hand-knotted tassels"],
    sizes: ["One Size"], stock: stockFor(a.seed, ["One Size"]),
    swatch: a.palette.base, createdAt: new Date(created + (20 + i) * 3600e3).toISOString(),
  });
});

fs.writeFileSync(path.join(root, "data/originals.json"), JSON.stringify(products, null, 2) + "\n");
console.log(`Wrote ${ORIGINALS.length} originals and ${ACCESSORIES.length} accessories to data/originals.json`);
