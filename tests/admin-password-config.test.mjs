import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { adminPasswordConfigured, adminPasswordMatches, readAdminCredential } from "../lib/admin-auth.mjs";
import { parseEnv, applyEnv } from "../lib/env.mjs";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aarzu-auth-"));
const file = path.join(temp, "admin-auth.json"), password = "FixtureAdminPass!";
const salt = crypto.randomBytes(16);
const record = { algorithm: "pbkdf2-sha256", iterations: 100000, salt: salt.toString("hex"), hash: crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex") };
try {
  fs.writeFileSync(file, JSON.stringify(record));
  for (const env of ["", "short", "aarzu-admin", "change-me-to-a-long-password"]) {
    assert(adminPasswordConfigured(env, file));
    assert(adminPasswordMatches(password, env, file));
    assert(!adminPasswordMatches("WrongPassword!", env, file));
  }
  assert(adminPasswordMatches("ExternalAdminPass!", "ExternalAdminPass!", file));
  assert(!adminPasswordMatches(password, "ExternalAdminPass!", file));
  for (const invalid of [{ ...record, iterations: 1 }, { ...record, salt: "abc" }, { ...record, hash: "wrong" }, null]) {
    fs.writeFileSync(file, JSON.stringify(invalid));
    assert.equal(readAdminCredential(file), null);
    assert(!adminPasswordConfigured("", file));
    assert(!adminPasswordMatches(password, "", file));
  }
  fs.unlinkSync(file);
  assert(!adminPasswordConfigured("", file));
  const values = parseEnv('\uFEFFexport ADMIN_PASSWORD="FixtureAdminPass!#"\r\nSITE_URL=https://aarzu.test # note\nMAIL_FROM=\'owner#mail@test\'\n# ignored');
  assert.deepEqual(values, { ADMIN_PASSWORD: "FixtureAdminPass!#", SITE_URL: "https://aarzu.test", MAIL_FROM: "owner#mail@test" });
  for (const old of [undefined, "", "aarzu-admin", "change-me-to-a-long-password"]) {
    const env = { ADMIN_PASSWORD: old }; applyEnv(env, values);
    assert.equal(env.ADMIN_PASSWORD, values.ADMIN_PASSWORD);
  }
  const external = { ADMIN_PASSWORD: "ExternalAdminPass!" }; applyEnv(external, values);
  assert.equal(external.ADMIN_PASSWORD, "ExternalAdminPass!");
  console.log("PASS salted password verification, invalid config denial, environment overrides and BOM/quoted .env parsing");
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
