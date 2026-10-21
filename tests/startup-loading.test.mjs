import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/core.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replace(/^export /gm, '');
const apiCode = section('export async function api(', '// ------------------------------------------------------------------ state');
const bootCode = section('export async function boot()', 'export const quote');
function fixture(fetch) {
  let timeout, cleared = false;
  const state = { cart: [{ id: 'saved', size: 'M', qty: 1 }], products: [], byId: {}, bySlug: {} };
  const make = new Function('fetch', 'state', 'setTimeout', 'clearTimeout', 'save', 'toast', 'lineKey', 'cartRoom', apiCode + bootCode + '\nreturn { api, boot };');
  const methods = make(fetch, state, (fn, ms) => { assert.equal(ms, 20000); timeout = fn; return 1; }, id => { assert.equal(id, 1); cleared = true; }, () => {}, () => {}, l => l.id, () => 10);
  return { ...methods, state, expire: () => timeout(), cleared: () => cleared };
}
// A stalled catalogue read must become a recoverable error without discarding the saved bag.
let requested;
const stalled = fixture((path, options) => { requested = { path, options }; return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))); });
const waiting = stalled.boot(); stalled.expire();
await assert.rejects(waiting, /taking too long/);
assert.equal(requested.path, '/api/catalog'); assert.equal(requested.options.signal.aborted, true);
assert.deepEqual(stalled.state.cart, [{ id: 'saved', size: 'M', qty: 1 }]); assert(stalled.cleared());

const product = { id: 'saved', slug: 'saved-suit', sizes: ['M'], stock: { M: 5 } }, store = { currency: 'Rs' };
const normal = fixture(async () => ({ ok: true, status: 200, json: async () => ({ products: [product], store }) }));
await normal.boot(); assert.equal(normal.state.bySlug['saved-suit'], product); assert.equal(normal.state.store, store); assert(normal.cleared());
assert.deepEqual(normal.state.cart, [{ id: 'saved', size: 'M', qty: 1 }]);

// This change must not impose the catalogue timeout on order submissions.
let orderOptions;
const orders = fixture(async (_, options) => { orderOptions = options; return { ok: true, status: 201, json: async () => ({ id: 'AZTEST' }) }; });
assert.equal((await orders.api('/api/orders', { payment: 'cod' })).id, 'AZTEST');
assert.equal(orderOptions.signal, undefined); assert.equal(orderOptions.method, 'POST');
console.log('PASS startup timeout, saved bag preservation, successful boot and unchanged order submission behavior');
