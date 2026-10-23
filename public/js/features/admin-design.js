import { registerRouteHook } from '../core.js';

// Keep shopping navigation and promotions out of the private workspace.
export function init() {
  const update = url => document.body.classList.toggle('admin-workspace', /^admin\./i.test(url.hostname) || /^\/admin(?:\/|$)/.test(url.pathname));
  registerRouteHook(update);
  update(new URL(location.href));
}
