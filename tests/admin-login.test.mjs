import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

async function runAdminChecks(files, { assert, Buffer, crypto, report }) {
  const secret = "SampleAdminPass!";
  const make = (deps, source, name) => new Function(...Object.keys(deps), source + "\nreturn " + name + ";")(...Object.values(deps));
  const nodeAuth = files["server.mjs"].match(/function adminOk\(req\) \{[\s\S]*?\n\}/)[0];
  const adminOk = make({ Buffer, crypto, ADMIN_PASSWORD: secret }, nodeAuth, "adminOk");
  assert.equal(adminOk({ headers: { authorization: "Bearer " + secret } }), true);
  assert.equal(adminOk({ headers: { "x-aarzu-admin": secret } }), true);
  assert.equal(adminOk({ headers: { authorization: "", "x-aarzu-admin": secret } }), true);
  assert.equal(adminOk({ headers: { authorization: "Bearer wrong", "x-aarzu-admin": secret } }), true);
  for (const headers of [{}, { authorization: "Bearer wrong" }, { "x-aarzu-admin": "wrong" }, { authorization: "Bearer " }, { "x-aarzu-admin": [secret] }]) assert.equal(adminOk({ headers }), false);
  report("PASS standard/fallback admin headers; missing and incorrect credentials denied");

  const core = files["public/js/core.js"];
  const code = core.slice(core.indexOf("export async function api("), core.indexOf("// ------------------------------------------------------------------ state")).replace(/^export /gm, "");
  let request;
  const api = make({ fetch: async (path, options) => { request = { path, options }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; } }, code, "api");
  const headers = { Authorization: "Bearer " + secret, "X-Aarzu-Admin": secret };
  await api("/api/admin/summary", undefined, undefined, headers);
  assert.equal(request.options.headers["X-Aarzu-Admin"], secret);
  assert.equal(request.path.includes(secret), false);
  await api("/api/admin/stock", { qty: 2 }, "POST", headers);
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.equal(request.options.headers.Authorization, "Bearer " + secret);
  const unavailable = make({ fetch: async () => ({ ok: true, status: 200, json: async () => { throw Error("HTML"); } }) }, code, "api");
  await assert.rejects(() => unavailable("/api/admin/summary"), /admin API is unavailable/);

  const pages = files["public/js/pages.js"];
  const start = pages.indexOf("function admin(main)"), end = pages.indexOf("\n// Admin orders:", start);
  assert(start >= 0 && end > start);
  const adminSource = pages.slice(start, end);
  function fixture(response) {
    const button = { disabled: false }, state = {}, main = { innerHTML: "" }, notices = [], requests = [];
    const form = { querySelector: () => button, elements: { namedItem: () => ({ value: secret }) } };
    const blocked = { getItem() { throw Error("Blocked"); }, setItem() { throw Error("Blocked"); }, removeItem() { throw Error("Blocked"); } };
    const admin = make({
      state, $: s => s === "#lf" ? form : null, sessionStorage: blocked, esc: String, rs: String,
      api: async (path, body, method, auth) => { requests.push({ path, auth }); return response(path); },
      ext: { adminTabs: [] }, adminOrders: () => "Orders", adminStock: () => "Stock",
      toast: msg => notices.push(msg)
    }, adminSource, "admin");
    admin(main);
    return { main, state, notices, button, requests, submit: () => form.onsubmit({ target: form, currentTarget: form, preventDefault() {} }) };
  }
  const successful = fixture(path => path === "/api/admin/orders" ? [] : { revenue: 0, orders: 0, pending: 0, waitlist: 0, newsletter: 0 });
  await successful.submit();
  assert(successful.main.innerHTML.includes("Dashboard"));
  assert.equal(successful.state.adminPassword, secret);
  assert(successful.requests.every(r => r.auth["X-Aarzu-Admin"] === secret));
  await successful.main.onclick({ target: { closest: s => s === "#out" ? {} : null } });
  assert.equal(successful.state.adminPassword, "");
  assert(successful.main.innerHTML.includes("Aarzu Admin"));
  const failure = fixture(() => { throw Object.assign(Error("Admin password is not configured"), { status: 503 }); });
  await failure.submit();
  assert.equal(failure.notices[0], "Admin password is not configured");
  assert.equal(failure.button.disabled, false);

  const feature = files["public/js/features/adminpro.js"];
  const authStart = feature.indexOf("const pw ="), authEnd = feature.indexOf("\nconst pct =", authStart);
  let sent;
  const state = { adminPassword: secret };
  const helpers = new Function("state", "sessionStorage", "fetch", "api", feature.slice(authStart, authEnd) + "\nreturn {pw,authFetch,send};")(
    state, { getItem() { throw Error("Blocked"); } },
    async (path, options) => { sent = options; return {}; }, async (_path, _body, _method, auth) => { sent = { headers: auth }; }
  );
  await helpers.authFetch("/api/admin/export/orders.csv");
  assert.equal(sent.headers["X-Aarzu-Admin"], secret);
  await helpers.send("/api/admin/coupons");
  assert.equal(sent.headers["X-Aarzu-Admin"], secret);
  report("PASS admin sign-in/logout with blocked storage, real error messages, invoice/export authentication and JSON headers");
}
const paths = ["server.mjs", "public/js/core.js", "public/js/pages.js", "public/js/features/adminpro.js"];
const files = Object.fromEntries(paths.map(path => [path, readFileSync(new URL("../" + path, import.meta.url), "utf8")]));
await runAdminChecks(files, { assert, Buffer, crypto, report: console.log });
