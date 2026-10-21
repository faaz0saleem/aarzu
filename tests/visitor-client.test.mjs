import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/js/features/visitors.js', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function fixture({ path = '/shop', host = 'aarzu.test', dnt = '0', fail = false } = {}) {
  let now = 100000, route;
  const requests = [], timers = [], documentEvents = {}, windowEvents = {};
  const document = { hidden: false, querySelector: () => null, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  const location = { pathname: path, hostname: host }, navigator = { userAgent: 'A normal browser', doNotTrack: dnt };
  const window = { addEventListener: (name, fn) => { windowEvents[name] = fn; } };
  const setTimer = (fn, ms) => { const timer = { fn, ms, active: true }; timers.push(timer); return timer; };
  const fetch = async (url, options) => { requests.push({ url, options }); if (fail) throw new Error('Network unavailable'); return { ok: true, json: async () => ({ registered: true }) }; };
  const dependencies = { sid: 'browser_identifier_0001', state: {}, registerRouteHook: fn => { route = fn; }, location, document, navigator, window, fetch, AbortController, Date: class extends Date { static now() { return now; } }, setTimeout: setTimer, setInterval: setTimer, clearTimeout: timer => { if (timer) timer.active = false; }, clearInterval: timer => { if (timer) timer.active = false; }, MutationObserver: class { observe() {} disconnect() {} }, sessionStorage: { getItem: () => null } };
  const init = new Function(...Object.keys(dependencies), code + '\nreturn init;')(...Object.values(dependencies)); init();
  return { requests, timers, document, documentEvents, windowEvents, navigator, route: () => route(), advance: () => { now += 45000; } };
}
const settled = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const browser = fixture(); assert.equal(browser.requests.length, 0);
assert.equal(browser.route(), undefined); await settled();
assert.equal(browser.requests.length, 1);
assert.equal(browser.requests[0].url, '/api/visitors');
assert.deepEqual(JSON.parse(browser.requests[0].options.body), { sid: 'browser_identifier_0001', registered: false });
assert.equal(browser.requests[0].options.headers.Authorization, undefined);
browser.route(); await settled(); assert.equal(browser.requests.length, 1);
browser.advance(); browser.route(); await settled();
assert.equal(JSON.parse(browser.requests[1].options.body).registered, true);
browser.document.hidden = true; browser.advance(); browser.route(); await settled(); assert.equal(browser.requests.length, 2);
browser.windowEvents.pagehide(); assert(browser.timers.filter(timer => timer.ms === 45000).every(timer => !timer.active));
browser.document.hidden = false; browser.windowEvents.pageshow({ persisted: true }); await settled();
assert.equal(browser.timers.filter(timer => timer.ms === 45000 && timer.active).length, 1); assert.equal(browser.requests.length, 3);
for (const options of [{ path: '/admin' }, { host: 'admin.aarzu.test' }, { dnt: '1' }]) {
  const excluded = fixture(options); excluded.route(); await settled(); assert.equal(excluded.requests.length, 0);
}
const privacy = fixture(); privacy.navigator.globalPrivacyControl = true; privacy.route(); await settled(); assert.equal(privacy.requests.length, 0);
const failed = fixture({ fail: true }); failed.route(); await settled(); failed.advance(); failed.route(); await settled(); assert.equal(failed.requests.length, 2);
assert.equal(JSON.parse(failed.requests[1].options.body).registered, false);
console.log('PASS optional tracking, throttled heartbeats, deduplication acknowledgement, hidden/admin/privacy exclusions, network failure and back-forward restore');
