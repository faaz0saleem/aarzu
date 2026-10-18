// Optional Meta Pixel and Google Analytics 4, switched on by filling
// "analytics": { "metaPixelId", "ga4Id" } in data/store.json. Tracks product
// views, add-to-bag, checkout and purchases so ads can be measured.
import { state, on, registerRouteHook } from "../core.js";

function loadScript(src) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.append(s);
}

export const css = false;

export function init() {
  const { metaPixelId, ga4Id } = state.store.analytics || {};
  if (!metaPixelId && !ga4Id) return;

  if (metaPixelId) {
    const f = (window.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); });
    window._fbq = f; f.push = f; f.loaded = true; f.version = "2.0"; f.queue = [];
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", metaPixelId);
  }
  if (ga4Id) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", ga4Id, { send_page_view: false });
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4Id)}`);
  }
  const fb = (...a) => window.fbq?.(...a);
  const ga = (...a) => window.gtag?.(...a);

  registerRouteHook((url) => {
    fb("track", "PageView");
    ga("event", "page_view", { page_path: url.pathname + url.search });
    const m = url.pathname.match(/^\/product\/([\w-]+)/);
    const p = m && state.bySlug[m[1]];
    if (p) {
      fb("track", "ViewContent", { content_ids: [p.id], content_name: p.title, value: p.price, currency: "PKR" });
      ga("event", "view_item", { currency: "PKR", value: p.price, items: [{ item_id: p.id, item_name: p.title }] });
    }
    if (url.pathname === "/checkout") {
      fb("track", "InitiateCheckout");
      ga("event", "begin_checkout", { currency: "PKR" });
    }
    if (url.pathname.startsWith("/order/")) {
      try {
        const o = JSON.parse(sessionStorage.getItem("az_last"));
        if (o && !sessionStorage.getItem(`az_tracked_${o.id}`)) {
          sessionStorage.setItem(`az_tracked_${o.id}`, "1");
          fb("track", "Purchase", { value: o.total, currency: "PKR" });
          ga("event", "purchase", { transaction_id: o.id, value: o.total, currency: "PKR" });
        }
      } catch {}
    }
  });

  // Add-to-bag: the bag's item count going up
  let count = state.cart.reduce((n, l) => n + l.qty, 0);
  on((what) => {
    if (what !== "cart") return;
    const now = state.cart.reduce((n, l) => n + l.qty, 0);
    if (now > count) {
      fb("track", "AddToCart", { currency: "PKR" });
      ga("event", "add_to_cart", { currency: "PKR" });
    }
    count = now;
  });
}
