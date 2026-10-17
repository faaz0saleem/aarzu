// Loads the product catalogue (Aarzu Originals + imported brand pieces),
// applies live stock, and reloads automatically when the data files change.
// An Original is only listed once its photo exists in
// public/images/originals/photos/<slug>.jpg (extra angles: <slug>-2.jpg ...).
import fs from "node:fs";
import path from "node:path";

export class Catalog {
  constructor(dataDir, photoDir, db) {
    this.dataDir = dataDir;
    this.photoDir = photoDir;
    this.db = db;
    this.files = ["originals.json", "catalog.brands.json", "media.json"].map((f) => path.join(dataDir, f));
    this.load();
    const reload = () => {
      this.load();
      console.log(`[catalog] reloaded: ${this.products.length} products with photos`);
    };
    for (const f of this.files) fs.watchFile(f, { interval: 1500 }, reload);
    fs.mkdirSync(photoDir, { recursive: true });
    let t;
    fs.watch(photoDir, () => {
      clearTimeout(t);
      t = setTimeout(reload, 400);
    });
  }

  photosFor(slug) {
    const re = new RegExp(`^${slug}(-(\\d+))?\\.(jpe?g|png|webp|avif)$`, "i");
    return this.photoFiles
      .filter((f) => re.test(f))
      .sort((a, b) => Number(a.match(re)[2] || 1) - Number(b.match(re)[2] || 1))
      .map((f) => `/images/originals/photos/${f}`);
  }

  load() {
    const all = [];
    this.photoFiles = fs.existsSync(this.photoDir) ? fs.readdirSync(this.photoDir) : [];
    this.media = [];
    for (const f of this.files) {
      try {
        const rows = JSON.parse(fs.readFileSync(f, "utf8"));
        if (f.endsWith("media.json")) this.media = rows;
        else all.push(...rows);
      } catch (e) {
        if (e.code !== "ENOENT") console.warn(`[catalog] could not read ${path.basename(f)}: ${e.message}`);
      }
    }
    for (const p of all) if (p.collection === "originals") p.images = this.photosFor(p.slug);
    this.products = process.env.SHOW_UNPHOTOGRAPHED ? all : all.filter((p) => p.images.length);
    this.byId = Object.fromEntries(this.products.map((p) => [p.id, p]));
    this.bySlug = Object.fromEntries(this.products.map((p) => [p.slug, p]));
  }

  // Stock overrides live in runtime/inventory.json: { [id]: { [size]: qty } }
  stockOf(p) {
    const inv = this.db.get("inventory", {});
    return { ...p.stock, ...(inv[p.id] || {}) };
  }

  setStock(id, size, qty) {
    const inv = this.db.get("inventory", {});
    const p = this.byId[id];
    inv[id] = { ...(p?.stock || {}), ...(inv[id] || {}), [size]: Math.max(0, Math.floor(qty)) };
    this.db.set("inventory", inv);
  }

  // Public view: never exposes where a piece was sourced from.
  publicList() {
    const reviews = this.db.get("reviews", []);
    const orders = this.db.get("orders", []);
    const sold = {};
    for (const o of orders) if (o.status !== "cancelled") for (const i of o.items) sold[i.id] = (sold[i.id] || 0) + i.qty;
    const rating = {};
    for (const r of reviews) {
      const x = (rating[r.productId] ||= { sum: 0, count: 0 });
      x.sum += r.rating;
      x.count++;
    }
    return this.products.map(({ source, ...p }) => {
      const r = rating[p.id];
      return { ...p, stock: this.stockOf(p), sold: sold[p.id] || 0, rating: r ? { avg: Math.round((r.sum / r.count) * 10) / 10, count: r.count } : null };
    });
  }
}
