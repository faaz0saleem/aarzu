import assert from "node:assert/strict";
import { lineKey } from "../public/js/pricing.js";

// Restricted browser storage must not interrupt cart actions or validation.
globalThis.localStorage = { getItem() { throw Error("Storage blocked"); }, setItem() { throw Error("Storage blocked"); } };
const notices = [];
globalThis.document = { addEventListener() {}, createElement: () => ({}), querySelector: () => ({ append: node => notices.push(node.innerHTML) }) };
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = () => 0;
try {
  const { state, addToCart, setQty, on, boot } = await import("../public/js/core.js");
  state.byId = {
    one: { sizes: ["Unstitched"], stock: { Unstitched: 1 } },
    many: { sizes: ["S", "M"], stock: { S: 3, M: 20 } },
    sold: { sizes: ["Unstitched"], stock: { Unstitched: 0 } },
  };
  state.cart = [];
  let changes = 0; on(what => { if (what === "cart") changes++; });
  assert.equal(addToCart("one", "Unstitched"), true);
  assert.equal(addToCart("one", "Unstitched"), false);
  assert.equal(addToCart("one", "Unstitched", 1, { addons: [{ key: "stitching", option: "basic" }] }), false);
  assert.equal(state.cart.length, 1);
  assert.equal(state.cart[0].qty, 1);
  assert.equal(changes, 1, "rejected actions do not emit successful cart changes");
  assert.equal(setQty(lineKey(state.cart[0]), 2), false);
  assert.equal(setQty(lineKey(state.cart[0]), 0), true);
  assert.equal(state.cart.length, 0);

  assert.equal(addToCart("many", "S", 2), true);
  assert.equal(addToCart("many", "S", 1, { meta: { summary: "A different option" } }), true);
  assert.equal(setQty(lineKey(state.cart[0]), 3), false, "different options share stock");
  assert.equal(addToCart("many", "S"), false);
  assert.equal(addToCart("many", "M", 10), true, "sizes have separate stock");
  assert.equal(addToCart("many", "M"), false, "a cart line is limited to ten");
  const before = JSON.stringify(state.cart);
  for (const args of [["sold", "Unstitched"], ["missing", "S"], ["many", "XL"], ["many", "S", -1], ["many", "S", 1.5], ["many", "S", NaN]]) assert.equal(addToCart(...args), false);
  for (const qty of [-1, 1.5, NaN, 11]) assert.equal(setQty(lineKey(state.cart[0]), qty), false);
  assert.equal(JSON.stringify(state.cart), before);
  assert(notices.length > 0);
  const products = Object.entries(state.byId).map(([id, p]) => ({ id, slug: id, ...p }));
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ products, store: {} }) });
  state.cart = [{ id: "one", size: "Unstitched", qty: 9 }, { id: "one", size: "Unstitched", qty: 1, meta: { summary: "Another option" } }, { id: "sold", size: "Unstitched", qty: 1 }, { id: "missing", size: "S", qty: 1 }];
  await boot();
  assert.deepEqual(state.cart, [{ id: "one", size: "Unstitched", qty: 1 }]);
  assert(notices.at(-1).includes("updated"));
  console.log("PASS cart stock limits, repeated clicks, shared add-on stock, sizes, quantity changes, sold-out items and blocked storage");
} finally { globalThis.setTimeout = realTimeout; }
