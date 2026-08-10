// Branches, currencies and theme — persisted to localStorage under bcn2_-
// prefixed keys per bcn-v2-phase1-entry-prompt.md §2 and CLAUDE.md's
// isolation invariant ("v2 config uses bcn2_* localStorage keys so a v2 bug
// can't corrupt the live app's settings").
//
// Seeded ONCE from v1's keys so a fresh v2 load has realistic test data
// (the shop's real branches/currencies/theme) with zero shared blast radius
// afterward — v2 never writes savedBranches/savedCurrencies/appTheme, and a
// bug here cannot touch what v1 reads.

const BRANCHES_KEY_V2   = 'bcn2_branches';
const CURRENCIES_KEY_V2 = 'bcn2_currencies';
const THEME_KEY_V2      = 'bcn2_theme';
const ACCENT_KEY_V2     = 'bcn2_accent';

const BRANCHES_KEY_V1   = 'savedBranches';
const CURRENCIES_KEY_V1 = 'savedCurrencies';
const THEME_KEY_V1      = 'appTheme';

// localStorage can throw (QuotaExceededError; SecurityError in
// storage-blocked contexts like Safari Private Browsing). seedFromV1() runs
// at module top level below, before the window.* exports at the bottom of
// this file — an unguarded throw there aborts config.js entirely and every
// caller of window.getBranches/getCurrencies/getTheme becomes a
// ReferenceError. Every localStorage touch in this file goes through these
// two so a blocked/full store degrades to in-memory defaults instead.
function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, val); } catch { /* storage blocked/full — proceed unpersisted */ }
}

// First run only: v2 key absent, v1 key present → copy the raw string across
// unparsed (both sides use the same JSON/plain-string shape for a given key,
// so no re-encoding is needed). After this, the two keys are independent —
// this never runs again once bcn2_* exists, even if v1's value later changes.
function seedFromV1(v2Key, v1Key) {
  if (safeGet(v2Key) !== null) return;
  const v1Val = safeGet(v1Key);
  if (v1Val !== null) safeSet(v2Key, v1Val);
}
seedFromV1(BRANCHES_KEY_V2, BRANCHES_KEY_V1);
seedFromV1(CURRENCIES_KEY_V2, CURRENCIES_KEY_V1);
seedFromV1(THEME_KEY_V2, THEME_KEY_V1);

// Default branch names for a NEW user, in the active UI language. Branches
// are persisted DATA matched against Sheet rows: saved branches are NEVER
// translated or renamed later — this only seeds the very first defaults.
// Uses t() directly (already the single source of truth for the lang/
// DEFAULT_LANG/en fallback chain, and defaults an unset lang to DEFAULT_LANG
// itself) instead of re-implementing a second, looser fallback here.
// Returns null if window.I18N hasn't loaded yet — callers must not persist
// that, or a transient load failure bakes the literal i18n keys in forever.
function defaultBranches() {
  if (!window.I18N?.defaultBranch1 || !window.I18N?.defaultBranch2) return null;
  const b1 = t('defaultBranch1'), b2 = t('defaultBranch2');
  return (b1 && b2) ? [b1, b2] : null; // i18n/build.js can fill a slot with '' — treat that as unresolved too
}

// Branches are persisted DATA (CLAUDE.md: "Branch names are persisted data.
// Only new-user defaults may be localized."). Unlike v1 (which leaves the
// seed unpersisted until the user first edits branches), the default names
// are written back immediately once resolved — so they can never shift if
// the UI language changes later, which is exactly what that invariant means.
function getBranches() {
  try {
    const saved = JSON.parse(safeGet(BRANCHES_KEY_V2) || 'null');
    if (Array.isArray(saved) && saved.length) {
      // Filter, don't coerce — a corrupt entry (null, a number, an object)
      // must not become the literal branch chip "null"/"3"/"[object Object]".
      const list = saved.filter(s => typeof s === 'string' && s.trim());
      if (list.length) return list;
    }
  } catch { /* corrupt value — fall through to defaults */ }
  const defaults = defaultBranches();
  if (!defaults) return ['Branch 1', 'Branch 2']; // I18N not loaded yet — in-memory only, not persisted
  safeSet(BRANCHES_KEY_V2, JSON.stringify(defaults));
  return defaults;
}

function getCurrencies() {
  try {
    const saved = JSON.parse(safeGet(CURRENCIES_KEY_V2) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter(c => c && c.code && c.symbol);
  } catch { /* corrupt value — fall through to empty */ }
  return [];
}

// Adds {code, symbol} if code isn't already present (case-insensitive on the
// code, matching how currency codes are actually compared elsewhere). Returns
// the stored entry either way, so a caller can always select() the result.
function addCurrency(code, symbol) {
  code = String(code || '').trim().toUpperCase();
  symbol = String(symbol || '').trim();
  if (!code || !symbol) return null;
  const list = getCurrencies();
  const existing = list.find(c => c.code.toUpperCase() === code);
  if (existing) return existing;
  const entry = { code, symbol };
  safeSet(CURRENCIES_KEY_V2, JSON.stringify([...list, entry]));
  return entry;
}

// Three modes (3.3): 'dark' (default) | 'oled' | 'light'. v1's key only ever
// held 'light'/'dark' — an inherited value outside this set (or absent) falls
// back to 'dark', same as before.
function getTheme() {
  const v = safeGet(THEME_KEY_V2);
  return (v === 'oled' || v === 'light') ? v : 'dark';
}

// Applies data-theme to the root immediately (not left to the caller) so
// every caller — including 3.4's switcher — gets a correct render for free.
function setTheme(theme) {
  const t = (theme === 'oled' || theme === 'light') ? theme : 'dark';
  safeSet(THEME_KEY_V2, t);
  document.documentElement.setAttribute('data-theme', t);
  return t;
}

// Accent presets (3.4b) — swap ONLY --accent/--accent-2 via [data-accent] in
// tokens.css; Periwinkle's dark/oled/light neutrals never change per-preset.
// No v1 key to seed from — v1 has no accent presets at all. An inherited
// value outside the known set (or absent) falls back to 'periwinkle', same
// pattern as getTheme().
const ACCENTS = ['periwinkle', 'blue', 'violet', 'pink', 'indigo'];

function getAccent() {
  const v = safeGet(ACCENT_KEY_V2);
  return ACCENTS.includes(v) ? v : 'periwinkle';
}

// Applies data-accent to the root immediately, same as setTheme() — every
// caller gets a correct render for free. 'periwinkle' clears the attribute
// rather than setting data-accent="periwinkle": tokens.css has no
// [data-accent="periwinkle"] block (it's :root's default), so leaving the
// attribute set to that value would be inert but misleading to inspect.
function setAccent(accent) {
  const a = ACCENTS.includes(accent) ? accent : 'periwinkle';
  safeSet(ACCENT_KEY_V2, a);
  if (a === 'periwinkle') document.documentElement.removeAttribute('data-accent');
  else document.documentElement.setAttribute('data-accent', a);
  return a;
}

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b — top-level
// `const`/`function` bindings are visible to later <script> tags by identifier
// lookup, but NOT as window.* properties. Anything reaching for window.getX
// needs this assigned explicitly.
window.getBranches   = getBranches;
window.getCurrencies = getCurrencies;
window.addCurrency   = addCurrency;
window.getTheme      = getTheme;
window.setTheme      = setTheme;
window.getAccent     = getAccent;
window.setAccent     = setAccent;
