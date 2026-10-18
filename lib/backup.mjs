// Daily snapshots of the runtime data (orders, customers, stock, reviews ...).
// Copies data/runtime/*.json into data/backups/<YYYY-MM-DD>/ and keeps the last 30.
//   npm run backup   -> take a snapshot now
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const SRC = process.env.RUNTIME_DIR || path.join(DATA, "runtime");
const DEST = path.join(DATA, "backups");
const KEEP = Number(process.env.BACKUP_KEEP) || 30;

export function backupNow() {
  if (!fs.existsSync(SRC)) return null;
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".json"));
  if (!files.length) return null;
  const dir = path.join(DEST, new Date().toISOString().slice(0, 10));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
  const days = fs.readdirSync(DEST).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP))) fs.rmSync(path.join(DEST, old), { recursive: true, force: true });
  return dir;
}

export function scheduleBackups() {
  const run = () => {
    try {
      const dir = backupNow();
      if (dir) console.log(`[backup] saved ${path.relative(DATA, dir)}`);
    } catch (e) {
      console.warn(`[backup] failed: ${e.message}`);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 6 * 3600e3).unref();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = backupNow();
  console.log(dir ? `Backup saved to ${dir}` : "Nothing to back up yet (no orders or customer data).");
}
