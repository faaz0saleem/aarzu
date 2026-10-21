import fs from "node:fs";
import crypto from "node:crypto";

export function strongAdminPassword(value) {
  return typeof value === "string" && value.length >= 10 &&
    !["aarzu-admin", "change-me-to-a-long-password"].includes(value);
}

export function readAdminCredential(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    if (value.algorithm !== "pbkdf2-sha256" || !Number.isInteger(value.iterations) ||
        value.iterations < 100000 || value.iterations > 2000000 ||
        typeof value.salt !== "string" || !/^(?:[a-f0-9]{2}){16,64}$/i.test(value.salt) ||
        typeof value.hash !== "string" || !/^[a-f0-9]{64}$/i.test(value.hash)) return null;
    return value;
  } catch { return null; }
}

export function adminPasswordConfigured(password, file) {
  return strongAdminPassword(password) || !!readAdminCredential(file);
}

export function adminPasswordMatches(candidate, password, file) {
  if (typeof candidate !== "string" || !candidate || candidate.length > 512) return false;
  if (strongAdminPassword(password)) {
    const given = Buffer.from(candidate), expected = Buffer.from(password);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }
  const credential = readAdminCredential(file);
  if (!credential) return false;
  const given = crypto.pbkdf2Sync(candidate, Buffer.from(credential.salt, "hex"), credential.iterations, 32, "sha256");
  return crypto.timingSafeEqual(given, Buffer.from(credential.hash, "hex"));
}
