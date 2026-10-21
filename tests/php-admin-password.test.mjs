import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aarzu-php-auth-"));
fs.mkdirSync(path.join(temp, "php")); fs.mkdirSync(path.join(temp, "data"));
fs.copyFileSync(new URL("../php/bootstrap.php", import.meta.url), path.join(temp, "php/bootstrap.php"));
const password = "FixtureAdminPass!", salt = crypto.randomBytes(16);
const credential = { algorithm: "pbkdf2-sha256", iterations: 100000, salt: salt.toString("hex"), hash: crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex") };
const file = path.join(temp, "data/admin-auth.json");
let php;
async function verify(env, candidate) {
  let result;
  if (process.env.PHP_WASM_MODULES) {
    php?.exit();
    {
      const base = process.env.PHP_WASM_MODULES;
      const { PHP } = await import(pathToFileURL(path.join(base, "@php-wasm/universal/index.js")));
      const { loadNodeRuntime, createNodeFsMountHandler } = await import(pathToFileURL(path.join(base, "@php-wasm/node/index.js")));
      php = new PHP(await loadNodeRuntime("8.3", { emscriptenOptions: { processId: 1235 } }));
      php.mkdir("/app"); await php.mount("/app", createNodeFsMountHandler(temp));
    }
    const r = await php.run({ code: '<?php require "/app/php/bootstrap.php"; echo json_encode([az_admin_password_matches(getenv("CANDIDATE")),az_admin_password_matches("WrongPassword!")]);', env: { ADMIN_PASSWORD: env, CANDIDATE: candidate } });
    assert.equal(r.errors, ""); result = r.text;
  } else {
    const r = spawnSync(process.env.PHP_BINARY || "php", ["-r", 'require $argv[1]; echo json_encode([az_admin_password_matches($argv[2]),az_admin_password_matches("WrongPassword!")]);', "--", path.join(temp, "php/bootstrap.php"), candidate], { env: { ...process.env, ADMIN_PASSWORD: env }, encoding: "utf8" });
    assert.equal(r.status, 0, r.error?.message || r.stderr); result = r.stdout;
  }
  return JSON.parse(result);
}
try {
  fs.writeFileSync(file, JSON.stringify(credential));
  for (const env of ["", "aarzu-admin", "change-me-to-a-long-password"]) assert.deepEqual(await verify(env, password), [true, false], `fallback with ${env || "empty environment"}`);
  assert.deepEqual(await verify("ExternalAdminPass!", "ExternalAdminPass!"), [true, false]);
  assert.deepEqual(await verify("ExternalAdminPass!", password), [false, false]);
  fs.writeFileSync(path.join(temp, ".env"), '\uFEFFexport ADMIN_PASSWORD="FileAdminPass!#"\r\n');
  assert.deepEqual(await verify("", "FileAdminPass!#"), [true, false]);
  fs.unlinkSync(path.join(temp, ".env"));
  fs.writeFileSync(file, '{"algorithm":"invalid"}');
  assert.deepEqual(await verify("", password), [false, false]);
  fs.unlinkSync(file);
  assert.deepEqual(await verify("", password), [false, false]);
  console.log("PASS PHP password hash compatibility, environment overrides, BOM .env and invalid/missing credentials");
} finally { php?.exit(); fs.rmSync(temp, { recursive: true, force: true }); }
