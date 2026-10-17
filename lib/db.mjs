// Tiny JSON-file persistence for runtime data (orders, reviews, waitlist...).
import fs from "node:fs";
import path from "node:path";

export class JsonStore {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    fs.mkdirSync(dir, { recursive: true });
  }

  file(name) {
    return path.join(this.dir, `${name}.json`);
  }

  get(name, fallback) {
    if (this.cache.has(name)) return this.cache.get(name);
    let value = fallback;
    try {
      value = JSON.parse(fs.readFileSync(this.file(name), "utf8"));
    } catch {}
    this.cache.set(name, value);
    return value;
  }

  set(name, value) {
    this.cache.set(name, value);
    const tmp = this.file(name) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, this.file(name));
  }

  push(name, item) {
    const list = this.get(name, []);
    list.push(item);
    this.set(name, list);
    return list.length;
  }
}
