import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { visitorStore } from '../lib/visitors-store.mjs';
import { handle } from '../lib/routes/visitors.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aarzu-visitors-'));
try {
  const store = visitorStore(root), a = { sid: 'visitor_browser_0001' }, b = { sid: 'visitor_browser_0002' };
  assert.deepEqual([store.summary(1000).liveVisitors, store.summary(1000).totalVisitors], [0, 0]);
  assert.equal(store.touch({ sid: '../../bad' }, 1000), false);
  assert(store.touch(a, 1000)); assert(store.touch(a, 1001)); assert(store.touch(a, 1002));
  assert.equal(store.summary(1002).totalVisitors, 1); assert.equal(store.summary(1002).liveVisitors, 1);
  assert(store.touch(b, 1030));
  assert.equal(store.summary(1122).liveVisitors, 1); assert.equal(store.summary(1122).totalVisitors, 2);
  assert(store.touch({ ...a, registered: true }, 1123)); assert.equal(store.summary(1123).liveVisitors, 2);
  assert.equal(store.summary(1243).liveVisitors, 0);
  assert.equal(visitorStore(root).summary(1243).totalVisitors, 2); // process restart preserves totals
  assert.equal(store.summary(1243).startedAt, new Date(1000000).toISOString());

  // An interrupted unique-visitor commit is completed exactly once before the next read.
  const hash = crypto.createHash('sha256').update('visitor_browser_0003').digest('hex').slice(0, 24);
  const dir = path.join(root, 'visitors'), file = `seen-${hash.slice(0, 2)}.json`;
  const existing = fs.existsSync(path.join(dir, file)) ? JSON.parse(fs.readFileSync(path.join(dir, file))) : {};
  const stats = JSON.parse(fs.readFileSync(path.join(dir, 'stats.json'))); stats.totalVisitors++;
  fs.writeFileSync(path.join(dir, '.pending.json'), JSON.stringify({ [file]: { ...existing, [hash]: true }, 'stats.json': stats }));
  assert.equal(store.summary(1300).totalVisitors, 3); assert(!fs.existsSync(path.join(dir, '.pending.json')));
  store.touch({ sid: 'visitor_browser_0003' }, 1301); assert.equal(store.summary(1301).totalVisitors, 3);
  assert.equal(fs.readdirSync(dir).filter(name => /^live-/.test(name)).length <= 5, true);
  for (const name of fs.readdirSync(dir)) assert(!fs.readFileSync(path.join(dir, name), 'utf8').includes('visitor_browser_')); // only hashes on disk

  // Repeated heartbeat writes must not grow the unique set or touch order files.
  fs.writeFileSync(path.join(root, 'orders.json'), '[{"id":"UNCHANGED"}]');
  for (let i = 0; i < 1000; i++) store.touch({ ...a, registered: true }, 1400 + i % 30);
  assert.equal(store.summary(1429).totalVisitors, 3); assert.equal(store.summary(1429).liveVisitors, 1);
  assert.equal(fs.readFileSync(path.join(root, 'orders.json'), 'utf8'), '[{"id":"UNCHANGED"}]');

  const replies = [], ctx = { db: { dir: root }, adminOk: () => false, readBody: async () => a, json: (_, __, status, data) => replies.push({ status, data }) };
  const response = { setHeader() {} };
  await handle({ method: 'GET', headers: {} }, response, new URL('https://aarzu.test/api/admin/visitors'), ctx);
  assert.equal(replies.at(-1).status, 401);
  ctx.adminOk = () => true;
  await handle({ method: 'GET', headers: {} }, response, new URL('https://aarzu.test/api/admin/visitors'), ctx);
  assert.equal(replies.at(-1).status, 200); assert.equal(replies.at(-1).data.totalVisitors, 3);
  await handle({ method: 'POST', headers: { host: 'aarzu.test', origin: 'https://other.test' } }, response, new URL('https://aarzu.test/api/visitors'), ctx);
  assert.equal(replies.at(-1).status, 403);
  await handle({ method: 'POST', headers: { host: 'aarzu.test', 'user-agent': 'Googlebot' } }, response, new URL('https://aarzu.test/api/visitors'), ctx);
  assert.equal(replies.at(-1).status, 202);
  fs.writeFileSync(path.join(dir, 'stats.json'), '{corrupt');
  ctx.readBody = async () => ({ sid: 'new_browser_after_corruption' });
  await handle({ method: 'POST', headers: { host: 'aarzu.test' } }, response, new URL('https://aarzu.test/api/visitors'), ctx);
  assert.equal(replies.at(-1).status, 202); // telemetry failure remains contained
  console.log('PASS visitor deduplication, live expiry, restarts, interrupted writes, hashed storage, 1,000 heartbeats, auth and failure isolation');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
