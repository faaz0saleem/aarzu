// Loads KEY=value pairs from a .env file next to server.mjs into process.env
// (real environment variables win). Lets the owner configure passwords and
// email without touching code. See .env.example.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strongAdminPassword } from "./admin-auth.mjs";

export function parseEnv(text) {
  const values = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (value.length >= 2 && ["'", '"'].includes(value[0]) && value.at(-1) === value[0]) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    values[match[1]] = value;
  }
  return values;
}

export function applyEnv(env, values) {
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === undefined || env[key] === "" || (key === "ADMIN_PASSWORD" && !strongAdminPassword(env[key]))) env[key] = value;
  }
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
try {
  applyEnv(process.env, parseEnv(fs.readFileSync(file, "utf8")));
} catch (e) {
  if (e.code !== "ENOENT") console.warn(`[env] could not read .env: ${e.message}`);
}
