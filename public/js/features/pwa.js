// Installable app (PWA): registers the service worker, offers "Get the Aarzu app"
// on phones from the 2nd visit, shows a refresh toast for new versions and an
// offline notice. Browsers without service workers simply skip the worker parts.
import { icon, toast, registerLink, registerRouteHook, ext, closeOverlay } from "../core.js";

const KEY = "az_pwa"; // { visits, dismissed } in localStorage
const DISMISS_DAYS = 30;
const APP_HREF = "/get-app"; // the menu link; clicks are caught below, so it is never a real page
const QUIET = /^\/(checkout|order|admin|product|partnerships|promotions)/; // no banner while buying or on product pages

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isIOSSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram/.test(ua);
const isMobile = () => navigator.userAgentData?.mobile ?? (isIOS || /Android|Mobile/i.test(ua));
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch {} };

const svg = (body) => `<svg class="i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const SHARE = svg('<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>');
const WIFI_OFF = svg('<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.52"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>');

let deferred = null; // saved beforeinstallprompt event
let banner = null;
let visits = 0;
let armed = false; // the banner waits a few seconds after load
let offered = false; // and is offered at most once per page load

// ------------------------------------------------------------------ service worker + updates
let waiting = null;
let refreshing = false;

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (location.protocol !== "https:" && !local) return;
  try {
    const firstLoad = !navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const offer = (w) => { if (w && navigator.serviceWorker.controller) showUpdate(w); };
    offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => w.state === "installed" && offer(w));
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) return;
      refreshing = false;
      location.reload();
    });
    // Phones keep the app open for days, so look for a new version now and then.
    let last = Date.now();
    const check = () => { if (Date.now() - last > 15 * 60e3) { last = Date.now(); reg.update().catch(() => {}); } };
    setInterval(check, 60 * 60e3);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
    if (firstLoad) warmCache();
  } catch (e) {
    console.warn("[pwa] service worker not registered:", e.message);
  }
}

// The first visit loaded before the worker took over: hand it what this page used so it works offline next time.
async function warmCache() {
  try {
    const reg = await navigator.serviceWorker.ready;
    setTimeout(() => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name);
      reg.active?.postMessage({ type: "CACHE_URLS", urls: [...new Set(urls)].slice(0, 150) });
    }, 2500);
  } catch {}
}

function showUpdate(w) {
  if (waiting) return;
  waiting = w;
  toast("A new version of Aarzu is ready", { icon: "sparkles", action: "Refresh", actionData: "pwa-refresh", href: "#", ms: 120000 });
}

// ------------------------------------------------------------------ install banner
function addLink() {
  if (!ext.links.some((l) => l.href === APP_HREF)) registerLink({ where: "menu", label: "Get the app", href: APP_HREF });
}
function removeLink() {
  const i = ext.links.findIndex((l) => l.href === APP_HREF);
  if (i >= 0) ext.links.splice(i, 1);
}

const dismissedRecently = () => Date.now() - (read().dismissed || 0) < DISMISS_DAYS * 864e5;

function maybeShowBanner() {
  if (!armed || offered || banner || standalone() || !isMobile() || visits < 2 || dismissedRecently() || QUIET.test(location.pathname)) return;
  if (deferred) showBanner("install");
  else if (isIOSSafari) showBanner("ios");
  else return;
  offered = true;
}

function showBanner(mode) {
  hideBanner();
  const sub = mode === "ios" ? `Tap Share <span class="pwa-share">${SHARE}</span> → <b>Add to Home Screen</b>` : "Shop faster, right from your home screen.";
  banner = document.createElement("div");
  banner.className = "pwa-banner";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Get the Aarzu app");
  banner.innerHTML = `<img src="/brand/aarzu-icon-192.png" alt="" width="48" height="48">
    <div class="pwa-banner-text"><b>Get the Aarzu app</b><span>${sub}</span></div>
    ${mode === "install" ? `<button class="btn rani sm" data-pwa-install>Install</button>` : ""}
    <button class="icon-btn pwa-x" data-pwa-dismiss aria-label="Not now">${icon("x", "", 18)}</button>`;
  document.body.append(banner);
  requestAnimationFrame(() => requestAnimationFrame(() => banner?.classList.add("on")));
}

function hideBanner() {
  const b = banner;
  banner = null;
  if (!b) return;
  b.classList.remove("on");
  setTimeout(() => b.remove(), 450);
}

async function install() {
  hideBanner();
  const e = deferred;
  deferred = null;
  removeLink(); // a saved prompt works once; the browser sends a new one if it may ask again
  if (!e) return;
  try {
    e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome !== "accepted") write({ dismissed: Date.now() });
  } catch {}
}

function onClick(e) {
  if (!(e.target instanceof Element)) return;
  if (e.target.closest(`a[href="${APP_HREF}"]`)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeOverlay();
    if (deferred) install();
    else if (isIOSSafari) showBanner("ios");
    else toast("Open your browser menu and choose <b>Install app</b>", { icon: "sparkles" });
    return;
  }
  if (e.target.closest("[data-pwa-install]")) return install();
  if (e.target.closest("[data-pwa-dismiss]")) { write({ dismissed: Date.now() }); return hideBanner(); }
  if (e.target.closest("[data-pwa-refresh]")) {
    e.preventDefault();
    if (!waiting) return;
    refreshing = true;
    waiting.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => { if (refreshing) { refreshing = false; location.reload(); } }, 4000);
  }
}

// ------------------------------------------------------------------ offline notice
let offlineBar = null;
function setOffline(off, announce) {
  if (off && !offlineBar) {
    offlineBar = document.createElement("div");
    offlineBar.className = "pwa-offline";
    offlineBar.setAttribute("role", "status");
    offlineBar.innerHTML = `${WIFI_OFF}<span>You're offline — showing saved pages</span>`;
    document.body.prepend(offlineBar);
    document.body.classList.add("pwa-is-offline");
  } else if (!off && offlineBar) {
    offlineBar.remove();
    offlineBar = null;
    document.body.classList.remove("pwa-is-offline");
    if (announce) toast("You're back online");
  }
}

// ------------------------------------------------------------------ start
export async function init() {
  visits = read().visits || 0;
  try {
    if (!sessionStorage.getItem("az_pwa_s")) {
      sessionStorage.setItem("az_pwa_s", "1");
      write({ visits: ++visits });
    }
  } catch {}

  document.addEventListener("click", onClick, true);
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    addLink();
    maybeShowBanner();
  });
  addEventListener("appinstalled", () => {
    deferred = null;
    removeLink();
    hideBanner();
    toast("Aarzu is on your home screen");
  });
  if (isIOSSafari && !standalone()) addLink();
  setTimeout(() => { armed = true; maybeShowBanner(); }, 3000);
  registerRouteHook((url) => (QUIET.test(url.pathname) ? hideBanner() : maybeShowBanner()));

  setOffline(!navigator.onLine);
  addEventListener("offline", () => setOffline(true));
  addEventListener("online", () => setOffline(false, true));

  if (document.readyState === "complete") registerWorker();
  else addEventListener("load", registerWorker, { once: true });
}
