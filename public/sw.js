// Aarzu service worker: an offline app shell plus careful caching.
//   Network-first (never stale code): page loads, our JS/CSS, GET /api/catalog.
//   Cache-first (capped):             images, fonts, /brand/, /img?u= product photos.
//   Never cached:                     non-GET, /admin, other /api/ calls, other sites (except web fonts).
// Bump VERSION when this file's caching rules change; old caches are removed on activate.
const VERSION = "v1";
const CORE = `aarzu-core-${VERSION}`; // shell, code, catalog, brand icons
const MEDIA = `aarzu-media-${VERSION}`; // photos and fonts, oldest dropped past MEDIA_MAX
const MEDIA_MAX = 150;
const SHELL = "/";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// Must cache for install to succeed.
const SHELL_FILES = ["/", "/css/style.css", "/js/app.js", "/js/core.js"];
// Nice to have: cached when available, skipped when not.
const EXTRA_FILES = [
  "/js/icons.js", "/js/pages.js", "/js/pricing.js", "/js/features/index.js", "/api/catalog", "/manifest.webmanifest",
  "/favicon.svg", "/brand/aarzu-mark.svg", "/brand/aarzu-logo-dark.svg", "/brand/aarzu-icon.svg",
  "/brand/aarzu-icon-192.png", "/brand/aarzu-icon-512.png", "/brand/apple-touch-icon.png",
];

const fresh = (u) => new Request(u, { cache: "no-cache" });

// Feature modules come from the FEATURES list in features/index.js, so new features are precached too.
async function featureFiles() {
  try {
    const src = await (await fetch(fresh("/js/features/index.js"))).text();
    const list = src.match(/FEATURES\s*=\s*\[([^\]]*)\]/)?.[1] || "";
    return [...list.matchAll(/["']([\w-]+)["']/g)].flatMap(([, n]) => [`/js/features/${n}.js`, `/css/features/${n}.css`]);
  } catch {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    await cache.addAll(SHELL_FILES.map(fresh));
    const more = [...EXTRA_FILES, ...(await featureFiles())];
    await Promise.all(more.map((u) => cache.add(fresh(u)).catch(() => {})));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith("aarzu-") && key !== CORE && key !== MEDIA) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  // The first visit loads before this worker is in control; the page sends what it loaded so it works offline too.
  if (data.type === "CACHE_URLS" && Array.isArray(data.urls)) event.waitUntil(warm(data.urls.slice(0, 150)));
});

// "page" | "code" | "media" | null (null = leave it to the browser, never cached)
function kindOf(req) {
  if (req.method !== "GET" || req.headers.has("range")) return null;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return FONT_HOSTS.includes(url.hostname) ? "media" : null;
  const p = url.pathname;
  if (p === "/admin" || p.startsWith("/admin/") || p.startsWith("/api/admin")) return null;
  if (p.startsWith("/api/")) return p === "/api/catalog" ? "code" : null;
  if (req.mode === "navigate") return "page";
  if ((p === "/img" && url.searchParams.has("u")) || p.startsWith("/brand/") || p.startsWith("/fonts/") || p.startsWith("/images/")) return "media";
  if (req.destination === "image" || req.destination === "font" || /\.(png|jpe?g|webp|avif|gif|svg|ico|woff2?)$/i.test(p)) return "media";
  if (/\.(m?js|css|webmanifest)$/i.test(p)) return "code";
  return null;
}

const cacheable = (res) => res && res.ok && !res.redirected && (res.type === "basic" || res.type === "cors") && !/no-store/i.test(res.headers.get("Cache-Control") || "");

self.addEventListener("fetch", (event) => {
  const kind = kindOf(event.request);
  if (kind === "page") event.respondWith(page(event));
  else if (kind === "code") event.respondWith(networkFirst(event));
  else if (kind === "media") event.respondWith(cacheFirst(event));
});

// Single-page app: any page can be drawn from the "/" shell when the network is down.
async function page(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (new URL(req.url).pathname === "/" && cacheable(res)) {
      const copy = res.clone();
      event.waitUntil(caches.open(CORE).then((c) => c.put(SHELL, copy)));
    }
    return res;
  } catch {
    const shell = await caches.match(SHELL, { cacheName: CORE });
    return shell || new Response("<!doctype html><meta name=viewport content='width=device-width'><title>Aarzu</title><p style='font:16px system-ui;padding:2rem;text-align:center'>You're offline. Please check your connection and try again.</p>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function networkFirst(event) {
  const req = event.request;
  try {
    const res = await fetch(req);
    if (cacheable(res)) {
      const copy = res.clone();
      event.waitUntil(caches.open(CORE).then((c) => c.put(req, copy)));
    }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { cacheName: CORE });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(event) {
  const req = event.request;
  const hit = (await caches.match(req, { cacheName: MEDIA })) || (await caches.match(req, { cacheName: CORE }));
  if (hit) return hit;
  const res = await fetch(req);
  if (cacheable(res)) {
    const copy = res.clone();
    event.waitUntil(caches.open(MEDIA).then((c) => c.put(req, copy)).then(trim));
  }
  return res;
}

// Keep the photo cache small: drop the oldest entries past MEDIA_MAX (one trim at a time).
let trimming = Promise.resolve();
function trim() {
  trimming = trimming.then(async () => {
    const cache = await caches.open(MEDIA);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - MEDIA_MAX; i++) await cache.delete(keys[i]);
  }).catch(() => {});
  return trimming;
}

async function warm(urls) {
  for (const u of urls) {
    try {
      const req = new Request(new URL(u, self.location.origin));
      const kind = kindOf(req);
      if (kind !== "code" && kind !== "media") continue;
      const name = kind === "code" ? CORE : MEDIA;
      if (await caches.match(req, { cacheName: name })) continue;
      const res = await fetch(req);
      if (cacheable(res)) await (await caches.open(name)).put(req, res);
    } catch {}
  }
  await trim();
}
