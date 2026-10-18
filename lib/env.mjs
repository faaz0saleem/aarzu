// Loads KEY=value pairs from a .env file next to server.mjs into process.env
// (real environment variables win). Lets the owner configure passwords and
// email without touching code. See .env.example.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
} catch (e) {
  if (e.code !== "ENOENT") console.warn(`[env] could not read .env: ${e.message}`);
}
