// Run with: node tests/storefront-regressions.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

async function regressionChecks(files, report = console.log) {
  const section = (path, start, end) => {
    const source = files[path], a = source.indexOf(start), b = end ? source.indexOf(end, a) : source.length;
    assert(a >= 0 && b > a, "Missing source section: " + path);
    return source.slice(a, b).replace(/^export /gm, "");
  };
  const factory = (deps, code, name) => new Function(...Object.keys(deps), code + "\nreturn " + name + ";")(...Object.values(deps));
  const apiCode = section("public/js/core.js", "export async function api(", "// ------------------------------------------------------------------ state");
  let response;
  const api = factory({ fetch: async () => response }, apiCode, "api");
  response = { ok: true, status: 200, json: async () => { throw Error("HTML response"); } };
  await assert.rejects(() => api("/api/orders"), /could not complete/);
  response = { ok: true, status: 200, json: async () => null };
  await assert.rejects(() => api("/api/orders"), /could not complete/);
  response = { ok: false, status: 422, json: async () => ({ error: "Check your phone", errors: { phone: "Invalid phone" } }) };
  await assert.rejects(() => api("/api/orders"), e => e.status === 422 && e.data.errors.phone === "Invalid phone");
  response = { ok: true, status: 201, json: async () => ({ id: "AZTEST123", total: 4000, payment: "cod" }) };
  assert.equal((await api("/api/orders")).id, "AZTEST123");
  report("PASS API rejects invalid responses and preserves validation errors");

  const wheelCode = section("public/js/app.js", "export function openWheel()", "function prizeHtml(");
  function wheelFixture(result, blockedStorage = false) {
    const button = { disabled: false }, control = { innerHTML: "" }, wheel = { style: {} };
    const form = { elements: { namedItem: () => ({ value: "" }) }, querySelector: () => button };
    const el = { isConnected: true }, timers = [], notices = [];
    let calls = 0, celebrates = 0;
    const open = factory({
      state: { store: { wheel: [{ label: "5% OFF", weight: 50, color: "#111" }, { label: "FREE DELIVERY", weight: 50, color: "#222" }] } },
      $: s => ({ "#spin-f": form, "#wheel": wheel, "#wheel-ctl": control })[s],
      openOverlay: () => el, icon: () => "", esc: String, prizeHtml: p => p.label + ":" + p.code,
      localStorage: { getItem: () => null, setItem: () => { if (blockedStorage) throw Error("Storage blocked"); } },
      api: async () => { calls++; return result(); }, toast: m => notices.push(m),
      setTimeout: fn => timers.push(fn), confetti: () => celebrates++
    }, wheelCode, "openWheel");
    open();
    return { button, control, wheel, timers, notices, submit: () => form.onsubmit({ preventDefault() {} }), calls: () => calls, celebrates: () => celebrates };
  }
  const win = { index: 0, prize: { label: "5% OFF", code: "SPIN5" } };
  let fail = true;
  const retry = wheelFixture(() => { if (fail) throw Error("Offline"); return win; });
  await retry.submit();
  assert.equal(retry.button.disabled, false);
  fail = false;
  await retry.submit();
  retry.timers[0]();
  assert.equal(retry.control.innerHTML, "5% OFF:SPIN5");
  const bad = wheelFixture(() => ({ index: 100, prize: win.prize }));
  await bad.submit();
  assert.equal(bad.button.disabled, false);
  assert.equal(bad.timers.length, 0);
  const blocked = wheelFixture(() => win, true);
  await blocked.submit();
  blocked.timers[0]();
  assert.equal(blocked.celebrates(), 1);
  let finishSpin;
  const pending = wheelFixture(() => new Promise(resolve => { finishSpin = resolve; }));
  const first = pending.submit();
  await pending.submit();
  assert.equal(pending.calls(), 1);
  finishSpin(win); await first;
  report("PASS wheel retries, validates prizes, prevents duplicate spins and tolerates blocked storage");

  const checkoutCode = section("public/js/pages.js", "function checkout(", "\nfunction success(");
  function checkoutFixture(result) {
    const state = { store: { cities: [{ name: "Karachi" }], cod: {}, returnDays: 7 }, cart: [{ id: "AZ-P", size: "M", qty: 1 }], coupon: null, credits: [], lastOrder: null };
    const button = { disabled: false }, main = {}, summary = {}, note = {}, eta = {}, coupon = {};
    const fields = Object.fromEntries(Object.entries({ name: "Test buyer", phone: "03001234567", email: "", city: "Karachi", address: "123 Test Street", notes: "", website: "", payment: "cod" }).map(([k, value]) => [k, { value }]));
    const form = { elements: { namedItem: name => fields[name] } };
    const cod = { checked: true }, label = { classList: { toggle() {} } };
    const nodes = { "#co": form, "#place": button, "#summary": summary, "#eta": eta, "#cod-note": note, "#cpn": coupon, '[data-pay="cod"] input': cod, '[data-pay="cod"]': label };
    let cleared = 0, calls = 0; const navigation = [], notices = [];
    const quote = () => ({ items: [{ id: "AZ-P", title: "Lawn suit", image: "", size: "M", qty: 1, line: 4000 }], subtotal: 4000, discounts: [], credits: [], shipping: 0, total: 4000, savings: 1000 });
    const blocked = { getItem() { throw Error("Storage blocked"); }, setItem() { throw Error("Storage blocked"); } };
    const checkout = factory({
      $: s => nodes[s] || null, $$: () => [], state, quote, icon: () => "", esc: String, rs: String, img: String,
      lineExtras: () => "", fillSlots() {}, dispatchInfo: () => ({ eta: "3 days" }),
      localStorage: blocked, sessionStorage: blocked, api: async () => { calls++; return result(); },
      clearCart() { cleared++; state.cart = []; }, setCoupon() {}, setCredit() {}, toast: m => notices.push(m)
    }, checkoutCode, "checkout");
    checkout(main, { go: path => navigation.push(path) });
    return { state, button, navigation, notices, cleared: () => cleared, calls: () => calls, submit: () => form.onsubmit({ preventDefault() {} }) };
  }
  const unconfirmed = checkoutFixture(() => ({}));
  await unconfirmed.submit();
  assert.equal(unconfirmed.cleared(), 0);
  assert.equal(unconfirmed.navigation.length, 0);
  assert.equal(unconfirmed.button.disabled, false);
  const order = { id: "AZTEST123", total: 4000, payment: "cod" };
  const successful = checkoutFixture(() => order);
  await successful.submit();
  assert.equal(successful.cleared(), 1);
  assert.equal(successful.navigation[0], "/order/AZTEST123");
  assert.equal(successful.state.lastOrder.customer.name, "Test buyer");
  let finishOrder;
  const pendingOrder = checkoutFixture(() => new Promise(resolve => { finishOrder = resolve; }));
  const firstOrder = pendingOrder.submit();
  await pendingOrder.submit();
  assert.equal(pendingOrder.calls(), 1);
  finishOrder(order); await firstOrder;
  report("PASS checkout keeps the bag on invalid responses and completes orders with blocked storage");

  const allowed = factory({}, section("lib/catalog.mjs", "export function allowedProduct("), "allowedProduct");
  assert.equal(allowed({ gender: "women", title: "Lawn suit" }), true);
  assert.equal(allowed({ gender: "men", title: "Cotton suit" }), false);
  for (const name of ["Sanam Saeed", "SANAM-SAEED", "sanam_saeed"]) assert.equal(allowed({ gender: "women", source: { url: "https://example.com/" + name } }), false);
  const products = JSON.parse(files["data/catalog.brands.json"]);
  assert(products.every(p => !p.description.toLowerCase().includes(p.source.brand.toLowerCase())));
  assert(products.every(p => p.compareAt - p.price === 1000));
  const transformCode = files["scripts/brands/transform.mjs"].replace(/^import .*?;\s*$/gm, "").replace(/^export /gm, "");
  const crypto = { createHash: () => ({ update() { return this; }, digest: () => "a1b2c3d4".repeat(8) }) };
  const transform = factory({ crypto }, transformCode, "transform");
  const raw = { name: "Printed Lawn 3 Piece", brand: "Khaadi", gender: "women", type: "unstitched", price_pkr: 5000, images: ["https://example.com/dress.jpg"] };
  const imported = transform([raw, { ...raw, name: "Sanam Saeed lawn" }, { ...raw, gender: "men" }]);
  assert.equal(imported.products.length, 1);
  assert.equal(imported.products[0].price, 4000);
  assert.equal(imported.products[0].compareAt, 5000);
  assert.equal(imported.products[0].description.includes("Khaadi"), false);
  assert.equal(imported.products[0].source.brand, "Khaadi");
  report("PASS catalog exclusions, private brand descriptions and Rs 1,000 discounts");
}
const paths = ["public/js/core.js", "public/js/app.js", "public/js/pages.js", "lib/catalog.mjs", "data/catalog.brands.json", "scripts/brands/transform.mjs"];
await regressionChecks(Object.fromEntries(paths.map(path => [path, readFileSync(new URL("../" + path, import.meta.url), "utf8")])));
