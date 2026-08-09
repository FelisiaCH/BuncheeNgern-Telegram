// Escape, amount formatting, toast, overlay, and the two document-level
// delegated listeners every screen wires into instead of inline onclick
// (bcn-v2-phase1-entry-prompt.md §5, "No inline onclick").
//
// Screens register click handlers into window.__actions and input/change
// handlers into window.__binds, keyed by the value of data-action / data-bind.
// This file owns both maps and the listeners that read them — a screen never
// attaches its own document-level listener.

window.__actions = {};
window.__binds   = {};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = window.__actions[el.dataset.action];
  if (fn) fn(el, e);
});
['input', 'change'].forEach(evt => {
  document.addEventListener(evt, e => {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    const fn = window.__binds[el.dataset.bind];
    if (fn) fn(el, e);
  });
});

// 🔤 esc — ported unchanged from v1 js/session.js.
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 🔗 safeUrl — ported unchanged from v1 js/session.js. https-only guard for
// slip links rendered as href — first needed by the dashboard's entry list.
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https:\/\//i.test(s) ? s : '';
}

// 💰 Amount helpers — ported unchanged from v1 js/core.js. Inputs display
// grouped values ("1,234.56") but every read goes through amt()/parseAmount()
// so the backend always receives raw numbers.
const parseAmount = v => String(v ?? '').replace(/,/g, '').trim();
const amt = v => { const n = parseFloat(parseAmount(v)); return isNaN(n) ? NaN : n; };
function formatAmount(v) {
  let s = parseAmount(v).replace(/[^\d.]/g, '');
  const d = s.indexOf('.');
  if (d !== -1) s = s.slice(0, d + 1) + s.slice(d + 1).replace(/\./g, '');
  let [int, dec] = s.split('.');
  int = (int || '').replace(/^0+(?=\d)/, '');
  const grouped = int ? Number(int).toLocaleString('en-US') : '';
  return dec !== undefined ? `${grouped || '0'}.${dec.slice(0, 2)}` : grouped;
}
// One delegated listener formats every .amt-fmt input, current and future —
// same pattern as v1, just not tied to a specific screen module.
document.addEventListener('input', e => {
  const el = e.target;
  if (!(el.classList && el.classList.contains('amt-fmt'))) return;
  const before = el.value, caret = el.selectionStart;
  el.value = formatAmount(el.value);
  const diff = el.value.length - before.length;
  try { el.setSelectionRange(Math.max(0, caret + diff), Math.max(0, caret + diff)); } catch { /* not a text-selectable input */ }
});

function fmtN(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(n) || 0);
}
const p2 = n => String(n).padStart(2, '0');
function nowStamp() {
  const d = new Date();
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
function fmtDateTab(d) {
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// 🔔 Toast — ported from v1 js/session.js; #toast/#toast-txt live in index.html.
const TOAST_DURATION = 3200;
function showToast(msg, type) {
  const txt = document.getElementById('toast-txt');
  const box = document.getElementById('toast');
  if (!txt || !box) return;
  txt.textContent = msg;
  box.className = `toast${type ? ' ' + type : ''}`;
  void box.offsetWidth; // restart the CSS transition if a toast is already showing
  box.classList.add('show');
  setTimeout(() => box.classList.remove('show'), TOAST_DURATION);
}

// ⏳ Overlay — ported from v1 js/session.js; #ov/#ov-msg live in index.html.
function showOv(msg) {
  const ov = document.getElementById('ov');
  if (!ov) return;
  document.getElementById('ov-msg').textContent = msg || t('loadingGeneric');
  ov.classList.remove('hidden');
}
function hideOv() {
  const ov = document.getElementById('ov');
  if (ov) ov.classList.add('hidden');
}

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b.
window.esc          = esc;
window.safeUrl      = safeUrl;
window.parseAmount  = parseAmount;
window.amt          = amt;
window.formatAmount = formatAmount;
window.fmtN         = fmtN;
window.nowStamp     = nowStamp;
window.fmtDateTab   = fmtDateTab;
window.showToast    = showToast;
window.showOv       = showOv;
window.hideOv       = hideOv;
