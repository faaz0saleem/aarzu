// First-party visitor counts. Requests are optional, bounded and never awaited by shopping.
import { sid, state, registerRouteHook } from '../core.js';

const adminPath = () => /^\/admin(?:\/|$)/.test(location.pathname) || /^admin\./i.test(location.hostname);
const excluded = () => adminPath() || document.hidden || navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true || /bot|crawler|spider|headless|lighthouse|facebookexternalhit|preview/i.test(navigator.userAgent);
let registered = false, lastPulse = 0, sending = false, pulseRequest;
async function pulse() {
  if (excluded() || sending || Date.now() - lastPulse < 40000) return;
  sending = true; lastPulse = Date.now(); pulseRequest = new AbortController();
  const controller = pulseRequest, timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('/api/visitors', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sid, registered }) });
    if (response.ok) registered = (await response.json()).registered === true || registered;
  } catch { /* Counting must never interrupt browsing or ordering. */ }
  finally { clearTimeout(timer); sending = false; if (pulseRequest === controller) pulseRequest = null; }
}

let observer, panel, reading, refreshTimer, lastCounts;
const number = value => Number(value).toLocaleString('en-PK');
function drawCounts(el, counts) {
  el.querySelector('[data-live]').textContent = number(counts.liveVisitors);
  el.querySelector('[data-total]').textContent = number(counts.totalVisitors);
  el.querySelector('[data-since]').textContent = counts.startedAt ? `Total since ${new Date(counts.startedAt).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Counting starts with the first tracked visitor.';
}
function stopAdmin() {
  observer?.disconnect(); observer = null; clearTimeout(refreshTimer); reading?.abort(); reading = null; panel?.remove(); panel = null;
}
async function refreshCounts() {
  const el = panel;
  if (!el?.isConnected || document.hidden || reading) return;
  const controller = new AbortController(); reading = controller;
  const timer = setTimeout(() => controller.abort(), 8000); let next = 15000;
  try {
    let password = state.adminPassword;
    if (!password) { try { password = sessionStorage.getItem('az_admin'); } catch {} }
    if (!password) { next = 0; throw new Error('Sign in to view visitor counts.'); }
    const response = await fetch('/api/admin/visitors', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal, headers: { Authorization: `Bearer ${password}`, 'X-Aarzu-Admin': password } });
    if (response.status === 401 || response.status === 403) { next = 0; throw new Error('Sign in again to refresh visitor counts.'); }
    if (!response.ok) { next = 60000; throw new Error('Visitor tracking is not available yet. Check that the update is deployed.'); }
    const counts = await response.json();
    if (![counts.liveVisitors, counts.totalVisitors].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('The visitor update could not be read.');
    if (controller.signal.aborted || !el.isConnected || panel !== el) return;
    lastCounts = counts; drawCounts(el, counts);
    el.querySelector('[data-visitor-status]').textContent = `Updated ${new Date(counts.lastUpdated).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit' })} PKT · Refreshes every 15 seconds`;
  } catch (error) {
    if (el.isConnected && panel === el && !document.hidden) el.querySelector('[data-visitor-status]').textContent = controller.signal.aborted ? 'Update delayed. Previous counts are shown; retrying shortly.' : error.message;
  } finally {
    clearTimeout(timer);
    if (reading === controller) { reading = null; if (next && el.isConnected && panel === el) refreshTimer = setTimeout(refreshCounts, next); }
  }
}
function watchAdmin() {
  stopAdmin(); if (!adminPath()) return;
  const main = document.querySelector('#main'); if (!main) return;
  const attach = () => {
    if (panel?.isConnected) return;
    clearTimeout(refreshTimer); reading?.abort(); reading = null; panel = null;
    const existing = main.querySelector('.admin .kpis'); if (!existing) return;
    panel = document.createElement('section'); panel.className = 'vi-panel'; panel.setAttribute('aria-label', 'Website visitors');
    panel.innerHTML = '<div class="vi-kpis"><div class="kpi"><b data-live>—</b><span><i class="vi-dot" aria-hidden="true"></i> Live visitors</span><small>Active in the last 2 minutes</small></div><div class="kpi"><b data-total>—</b><span>Total visitors</span><small>Unique browsers since tracking began</small></div></div><div class="vi-meta"><span data-since></span><button type="button" data-visitor-refresh>Refresh counts</button></div><p data-visitor-status role="status" aria-live="polite">Loading visitor counts…</p><small class="vi-explainer">Repeat visits and tabs in the same browser count once. Different devices, private browsing or cleared storage can count separately. Admin pages and known bots are excluded. These counts cannot recover visits from before tracking was installed.</small>';
    existing.insertAdjacentElement('afterend', panel);
    if (lastCounts) drawCounts(panel, lastCounts);
    panel.querySelector('[data-visitor-refresh]').onclick = () => { clearTimeout(refreshTimer); refreshCounts(); };
    refreshCounts();
  };
  observer = new MutationObserver(attach); observer.observe(main, { childList: true, subtree: true }); attach();
}

export function init() {
  registerRouteHook(() => { if (adminPath()) watchAdmin(); else { stopAdmin(); pulse(); } });
  const initial = setTimeout(pulse, 1500); let heartbeat = setInterval(pulse, 45000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pulseRequest?.abort(); clearTimeout(refreshTimer); reading?.abort(); }
    else if (adminPath()) refreshCounts(); else { lastPulse = 0; pulse(); }
  });
  window.addEventListener('pagehide', () => { clearTimeout(initial); clearInterval(heartbeat); pulseRequest?.abort(); stopAdmin(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { clearInterval(heartbeat); heartbeat = setInterval(pulse, 45000); lastPulse = 0; if (adminPath()) watchAdmin(); else pulse(); } });
  if (adminPath()) watchAdmin();
}
