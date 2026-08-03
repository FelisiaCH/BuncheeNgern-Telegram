// 💰 Amount helpers — inputs display grouped values ("1,234.56") but every read
// goes through amt()/parseAmount() so the backend always receives raw numbers.
// strip grouping → parseable numeric string
const parseAmount = v => String(v ?? '').replace(/,/g, '').trim();
// numeric value (NaN if empty/invalid)
const amt = v => { const n = parseFloat(parseAmount(v)); return isNaN(n) ? NaN : n; };
// format with en-US grouping; keep a trailing decimal the user is typing
function formatAmount(v){
  let s = parseAmount(v).replace(/[^\d.]/g, '');
  const d = s.indexOf('.');
  if (d !== -1) s = s.slice(0, d + 1) + s.slice(d + 1).replace(/\./g, ''); // one dot only
  let [int, dec] = s.split('.');
  int = (int || '').replace(/^0+(?=\d)/, '');
  const grouped = int ? Number(int).toLocaleString('en-US') : '';
  return dec !== undefined ? `${grouped || '0'}.${dec.slice(0, 2)}` : grouped;
}
// One delegated listener formats every .amt-fmt input, current and future
document.addEventListener('input', e => {
  const el = e.target;
  if (!(el.classList && el.classList.contains('amt-fmt'))) return;
  const before = el.value, caret = el.selectionStart;
  el.value = formatAmount(el.value);
  const diff = el.value.length - before.length;
  try { el.setSelectionRange(Math.max(0, caret + diff), Math.max(0, caret + diff)); } catch (_) {}
});
// 💡 Price-suggestion chips — ×10/×100/×1000 shortcuts under the primary amount.
// Tapping a chip fills #f-price and re-fires 'input' so formatting + chips re-run.
function renderPriceSuggest() {
  const wrap = $('price-suggest');
  if (!wrap) return;
  const base = amt($('f-price').value);
  wrap.innerHTML = '';
  if (!isFinite(base) || base <= 0) return;
  [10, 100, 1000].forEach(mult => {
    const val = Math.round(base * mult * 100) / 100; // avoid FP artifacts on decimals
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'price-chip';
    btn.textContent = formatAmount(String(val));
    btn.addEventListener('click', () => {
      $('f-price').value = formatAmount(String(val));
      $('f-price').dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrap.appendChild(btn);
  });
}

// 🗣️ Language Settings — must resolve BEFORE the branch block below, because
// the new-user default branch names are seeded in the active UI language.
// (Only window.LANGS + localStorage + navigator are needed here, all available.)
const LANG_KEY = 'appLang';
const DEFAULT_LANG = 'th';

function detectDeviceLang() {
  const tags = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ''];
  for (let i = 0; i < tags.length; i++) {
    const base = String(tags[i] || '').split('-')[0].toLowerCase();
    if (LANGS[base]) return base;
  }
  return 'en';
}

const _savedLang = localStorage.getItem(LANG_KEY);
let currentLang = LANGS[_savedLang] ? _savedLang : detectDeviceLang();

// 🔧 Branches & Constants
const BRANCHES_KEY    = 'savedBranches';
const BRANCH_ICONS    = ['🏪', '🏬', '🏢', '🏭', '🏛️', '🏦'];

// Default branch names for a NEW user, in the active UI language (t() isn't
// defined yet at module load, so read the I18N dict directly). Branches are
// persisted DATA matched against Sheet rows — saved branches are NEVER
// translated or renamed; this only seeds the very first defaults.
function defaultBranches() {
  const pick = k => (window.I18N?.[k]?.[currentLang]
    ?? window.I18N?.[k]?.[DEFAULT_LANG] ?? window.I18N?.[k]?.en ?? k);
  return [pick('defaultBranch1'), pick('defaultBranch2')];
}

function loadBranches() {
  try {
    const saved = JSON.parse(localStorage.getItem(BRANCHES_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.map(String);
  } catch { }
  return defaultBranches();
}

let BRANCHES    = loadBranches();
let BRANCH_KEYS = ['All', ...BRANCHES];

const CURRENCIES_KEY = 'savedCurrencies';
function loadCurrencies() {
  try {
    const saved = JSON.parse(localStorage.getItem(CURRENCIES_KEY) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter(c => c && c.code && c.symbol);
  } catch {}
  return [];
}
let CURRENCIES = loadCurrencies();

const TOAST_DURATION   = 3200;
const MAX_FILE_SIZE    = 5 * 1024 * 1024;
const MAX_IMG_PX       = 1280;
const IMG_QUALITY      = 0.82;
const API_TIMEOUT      = 15000;

// 🗂️ App & Dashboard State
const A = {
  me:          null,
  userEmail:   '',
  sessionToken: null,
  fd: { type:'income', shop: BRANCHES[0], pay:'Cash', splitBuckets: [] },
  slip:      null,
};
let dashByBranchCur  = {};
let dashByCur        = {};
let dashEntries      = [];
let activeCurTab     = CURRENCIES.length ? CURRENCIES[0].code : '';
let activeBranchFilter = 'All';
let BRANCH_FILTER_IDS = {};
let dashDate    = new Date();
let loadDashSeq = 0;
const rawApiCache  = {};
const DASH_CACHE_KEY = 'bcn_dashcache_v1';
const DASH_CACHE_MAX = 30;   // cap cached day-tabs so localStorage can't grow unbounded
let   dashCacheOrder = [];   // tab strings, oldest→newest (LRU eviction order)

// Hydrate rawApiCache from localStorage on startup (called on a same-user
// reload/restore, never after a user switch).
function loadDashCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null');
    if (saved && saved.data && typeof saved.data === 'object') {
      Object.keys(saved.data).forEach(k => { rawApiCache[k] = saved.data[k]; });
      dashCacheOrder = Array.isArray(saved.order)
        ? saved.order.filter(k => rawApiCache[k] !== undefined)
        : Object.keys(rawApiCache);
    }
  } catch { /* absent or corrupt cache — start empty */ }
}

// Write the cache back to localStorage, marking `tab` as most-recently-used and
// evicting the oldest tabs past the cap. Best-effort: quota/serialization errors
// are swallowed because the cache is an optimization, not state of record.
function persistDashCache(tab) {
  if (tab) {
    dashCacheOrder = dashCacheOrder.filter(k => k !== tab);
    dashCacheOrder.push(tab);
    while (dashCacheOrder.length > DASH_CACHE_MAX) delete rawApiCache[dashCacheOrder.shift()];
  }
  try {
    localStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ order: dashCacheOrder, data: rawApiCache }));
  } catch { /* quota / serialization — ignore */ }
}

// Drop `tab` from the cache (memory + disk) so its next open refetches fresh.
// Used after a submit changes today's data.
function invalidateDashTab(tab) {
  if (rawApiCache[tab] !== undefined) {
    delete rawApiCache[tab];
    dashCacheOrder = dashCacheOrder.filter(k => k !== tab);
    persistDashCache();
  }
}

// Wipe all cached dashboard data (memory + disk). Called on a user switch or a
// hard logout so device B's data never surfaces under user A.
function clearDashCache() {
  Object.keys(rawApiCache).forEach(k => delete rawApiCache[k]);
  dashCacheOrder = [];
  try { localStorage.removeItem(DASH_CACHE_KEY); } catch { /* ignore */ }
}

// 🎨 Theme Settings
const THEME_KEY = 'appTheme';

function loadTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);

  const icoLogin = $('theme-ico-login');
  if (icoLogin) {
    icoLogin.innerHTML = theme === 'light'
      ? '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }

  const sgTheme = $('sg-theme');
  if (sgTheme) {
    sgTheme.querySelectorAll('.seg.theme').forEach((btn, i) => {
      const isLight = i === 0;
      btn.classList.toggle('on', (theme === 'light') === isLight);
    });
  }
}

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  applyTheme(next);
}

function setTheme(theme, btn) {
  applyTheme(theme);
}

loadTheme();

// 🔤 Translation Helpers
function t(key, vars) {
  const entry = I18N[key];
  let str = entry ? (entry[currentLang] ?? entry[DEFAULT_LANG] ?? entry.en ?? '') : key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replaceAll(`{${k}}`, String(v)); });
  return str;
}

function setLang(lang) {
  if (!LANGS[lang] || lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem(LANG_KEY, lang);
  applyTranslations();

  const btnEl = $('g-signin-btn');
  if (window.google?.accounts?.id && btnEl) {
    btnEl.innerHTML = '';
    google.accounts.id.renderButton(btnEl, { theme: 'outline', size: 'medium', shape: 'pill', locale: gsiLocale(currentLang) });
  }
}

function renderLangSwitchers() {
  ['lang-switch-login'].forEach(wrapId => {
    const wrap = $(wrapId);
    if (!wrap) return;
    wrap.innerHTML = '';
    Object.entries(LANGS).forEach(([code, info]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `lang-btn${code === currentLang ? ' on' : ''}`;
      btn.setAttribute('aria-label', info.label);
      btn.innerHTML = `<span class="flag">${info.flag}</span><span>${esc(info.label)}</span>`;
      btn.addEventListener('click', () => setLang(code));
      wrap.appendChild(btn);
    });
  });
}

function renderLangPicker(query) {
  const list = $('lang-picker-list');
  if (!list || !window.LANGS) return;
  const q = (query || '').trim().toLowerCase();
  let html = '';
  Object.entries(LANGS).forEach(([code, info]) => {
    if (q && !(code.toLowerCase().includes(q) || info.label.toLowerCase().includes(q))) return;
    const active = code === currentLang;
    html += `<div class="cur-row${active ? ' is-active' : ''}" data-code="${esc(code)}">` +
      `<span class="cur-row-sym">${info.flag}</span>` +
      `<span class="cur-row-info">` +
        `<div class="cur-row-code">${esc(info.label)}</div>` +
        `<div class="cur-row-name">${esc(code.toUpperCase())}</div>` +
      `</span>` +
      (active ? `<span class="cur-added-badge">✓</span>` : '') +
      `</div>`;
  });
  if (!html) {
    html = `<div style="padding:16px;text-align:center;color:var(--txt-muted);font-size:13px">—</div>`;
  }
  list.innerHTML = html;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-optional]').forEach(el => {
    const txt = t(el.dataset.i18nOptional);
    el.textContent = txt;
    el.classList.toggle('hidden', !txt);
  });

  renderLangSwitchers();
  renderLangPicker($('lang-picker-search')?.value || '');
  renderBranchSegments();
  renderBranchFilters();
  renderManageBranchesList();
  renderManageCurrenciesList();
  renderCurrencyPicker($('cur-picker-search')?.value || '');
  renderComboOptions($('f-item')?.value || '');
  if (A.fd.pay === 'Split') renderSplitBuilder($('split-grp-0'), A.fd);

  if (!$('scr-app').classList.contains('hidden')) {
    $('f-date-lbl').textContent = fmtDateTab(new Date());
    if (!$('tab-dash').classList.contains('hidden')) refreshDashUI();
  }
}

