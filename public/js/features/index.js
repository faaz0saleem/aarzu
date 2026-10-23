// Feature modules loaded by app.js at start-up. Each name maps to:
//   public/js/features/<name>.js   — ES module; optional `export async function init()`
//   public/css/features/<name>.css — optional stylesheet (loaded automatically)
//   lib/routes/<name>.mjs          — optional server module (see the hooks list in server.mjs)
// A feature registers itself in init() through the helpers exported by core.js:
//   registerRoute(regex, renderFn)      new pages (renderFn(view, { url, params, go, replace }))
//   registerSlot(name, fn(el, data))    fill page slots: home-mid, home-end, pdp-options, pdp-actions,
//                                       pdp-after (data.pid), cart-extras (data.quote),
//                                       checkout-extras, checkout-credits (data.quote, data.refresh),
//                                       success-extras (data.order)
//   registerCardExtra(fn(product))      extra HTML inside every product card
//   registerLineOption(fn(product, el)) add-ons/meta for "Add to bag" on the product page
//   registerHeaderTool(fn)              header icon HTML
//   registerLink({ where, label, href }) footer ("shop" | "help" | "aarzu") or mobile "menu" links
//   registerAdminTab({ key, label, render(el, call) })
//   registerRouteHook(fn(url, view))    runs after every page render
//   setCredit(key, { label, amount, payload }) apply a gift card / points credit to the bag
export const FEATURES = ["quickview", "stitching", "giftcards", "account", "policies", "analytics", "guides", "alerts", "adminpro", "pwa", "outfit-preview", "visitors", "partnerships"];
