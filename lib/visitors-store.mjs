import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const WINDOW = 120, MAX_LOG = 2097152;
const read = (file, fallback = {}) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
function atomic(file, data) {
  const temporary = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 }); fs.renameSync(temporary, file);
}
function recover(dir) {
  const journal = path.join(dir, '.pending.json'); if (!fs.existsSync(journal)) return;
  for (const [name, data] of Object.entries(read(journal))) {
    if (!/^(stats|seen-[a-f0-9]{2})\.json$/.test(name)) throw new Error('Invalid visitor journal');
    atomic(path.join(dir, name), data);
  }
  fs.unlinkSync(journal);
}
export function visitorStore(runtime) {
  const dir = path.join(runtime, 'visitors');
  const ready = () => fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return {
    touch(body, now = Math.floor(Date.now() / 1000)) {
      if (typeof body?.sid !== 'string' || !/^[a-zA-Z0-9_-]{12,80}$/.test(body.sid)) return false;
      ready(); recover(dir);
      const hash = crypto.createHash('sha256').update(body.sid).digest('hex').slice(0, 24);
      if (body.registered !== true) {
        const name = `seen-${hash.slice(0, 2)}.json`, seen = read(path.join(dir, name));
        if (!seen[hash]) {
          const stats = read(path.join(dir, 'stats.json'), { totalVisitors: 0, startedAt: new Date(now * 1000).toISOString() });
          seen[hash] = true; stats.totalVisitors++; stats.updatedAt = new Date(now * 1000).toISOString();
          const changes = { [name]: seen, 'stats.json': stats }; atomic(path.join(dir, '.pending.json'), changes);
          for (const [file, data] of Object.entries(changes)) atomic(path.join(dir, file), data);
          fs.unlinkSync(path.join(dir, '.pending.json'));
        }
      }
      const minute = Math.floor(now / 60), file = path.join(dir, `live-${minute}.log`), fresh = !fs.existsSync(file);
      if (!fresh && fs.statSync(file).size >= MAX_LOG) return false;
      fs.appendFileSync(file, `${now} ${hash}\n`, { mode: 0o600 });
      if (fresh) for (const name of fs.readdirSync(dir)) { const match = /^live-(\d+)\.log$/.exec(name); if (match && Number(match[1]) < minute - 4) fs.unlinkSync(path.join(dir, name)); }
      return true;
    },
    summary(now = Math.floor(Date.now() / 1000)) {
      ready(); recover(dir);
      const stats = read(path.join(dir, 'stats.json'), { totalVisitors: 0, startedAt: null }), live = new Set(), minute = Math.floor(now / 60);
      for (let bucket = minute - 2; bucket <= minute; bucket++) {
        const file = path.join(dir, `live-${bucket}.log`); if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, 'utf8').slice(0, MAX_LOG).split('\n')) {
          const match = /^(\d+) ([a-f0-9]{24})$/.exec(line);
          if (match && Number(match[1]) > now - WINDOW && Number(match[1]) <= now) live.add(match[2]);
        }
      }
      return { liveVisitors: live.size, totalVisitors: stats.totalVisitors, startedAt: stats.startedAt, lastUpdated: new Date(now * 1000).toISOString(), liveWindowSeconds: WINDOW };
    }
  };
}
