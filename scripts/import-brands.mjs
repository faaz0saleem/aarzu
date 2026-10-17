// Import brand products into the store.
//   npm run import -- cowork-part1.json cowork-part2.json   (files with JSON, fences OK)
//   npm run import -- --replace all.json                     (replace instead of merge)
// Writes data/catalog.brands.json; a running server picks it up automatically.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform, parsePasted } from "./brands/transform.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "data", "catalog.brands.json");

export function writeCatalog(rows, { replace = false, log = console.log } = {}) {
  const { products, warnings } = transform(rows);
  warnings.forEach((w) => log(`  ! ${w}`));
  let existing = [];
  if (!replace) try { existing = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch {}
  const byUrl = new Map(existing.map((p) => [p.source?.url || p.id, p]));
  for (const p of products) byUrl.set(p.source.url || p.id, p);
  const all = [...byUrl.values()];
  fs.writeFileSync(OUT + ".tmp", JSON.stringify(all, null, 2) + "\n");
  fs.renameSync(OUT + ".tmp", OUT);
  const count = (g) => all.filter((p) => p.gender === g).length;
  log(`✓ ${products.length} imported · catalogue now has ${all.length} brand pieces (${count("women")} women, ${count("men")} men) → data/catalog.brands.json`);
  return all;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const files = args.filter((a) => !a.startsWith("--"));
  const text = files.length ? files.map((f) => fs.readFileSync(f, "utf8")).join("\n") : fs.readFileSync(0, "utf8");
  const rows = parsePasted(text);
  if (!rows.length) {
    console.error("No product JSON found. Pass the file(s) holding the Cowork output, or pipe it in.");
    process.exit(1);
  }
  console.log(`Found ${rows.length} products in the input.`);
  writeCatalog(rows, { replace });
}
