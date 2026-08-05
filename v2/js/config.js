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

const BRANCHES_KEY_V1   = 'savedBranches';
const CURRENCIES_KEY_V1 = 'savedCurrencies';
const THEME_KEY_V1      = 'appTheme';

// First run only: v2 key absent, v1 key present → copy the raw string across
// unparsed (both sides use the same JSON/plain-string shape for a given key,
// so no re-encoding is needed). After this, the two keys are independent —
// this never runs again once bcn2_* exists, even if v1's value later changes.
function seedFromV1(v2Key, v1Key) {
  if (localStorage.getItem(v2Key) !== null) return;
  const v1Val = localStorage.getItem(v1Key);
  if (v1Val !== null) localStorage.setItem(v2Key, v1Val);
}
seedFromV1(BRANCHES_KEY_V2, BRANCHES_KEY_V1);
seedFromV1(CURRENCIES_KEY_V2, CURRENCIES_KEY_V1);
seedFromV1(THEME_KEY_V2, THEME_KEY_V1);

// Default branch names for a NEW user, in the active UI language. Branches
// are persisted DATA matched against Sheet rows: saved branches are NEVER
// translated or renamed later — this only seeds the very first defaults.
function defaultBranches() {
  const lang = store.get().lang;
  const pick = k => (window.I18N?.[k]?.[lang]
    ?? window.I18N?.[k]?.en ?? k);
  return [pick('defaultBranch1'), pick('defaultBranch2')];
}

// Branches are persisted DATA (CLAUDE.md: "Branch names are persisted data.
// Only new-user defaults may be localized."). Unlike v1 (which leaves the
// seed unpersisted until the user first edits branches), the default names
// are written back immediately on first read — so they can never shift if
// the UI language changes later, which is exactly what that invariant means.
function getBranches() {
  try {
    const saved = JSON.parse(localStorage.getItem(BRANCHES_KEY_V2) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.map(String);
  } catch { /* corrupt value — fall through to defaults */ }
  const defaults = defaultBranches();
  localStorage.setItem(BRANCHES_KEY_V2, JSON.stringify(defaults));
  return defaults;
}

function getCurrencies() {
  try {
    const saved = JSON.parse(localStorage.getItem(CURRENCIES_KEY_V2) || 'null');
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
  localStorage.setItem(CURRENCIES_KEY_V2, JSON.stringify([...list, entry]));
  return entry;
}

function getTheme() {
  return localStorage.getItem(THEME_KEY_V2) === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY_V2, t);
  return t;
}

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b — top-level
// `const`/`function` bindings are visible to later <script> tags by identifier
// lookup, but NOT as window.* properties. Anything reaching for window.getX
// needs this assigned explicitly.
window.defaultBranches = defaultBranches;
window.getBranches   = getBranches;
window.getCurrencies = getCurrencies;
window.addCurrency   = addCurrency;
window.getTheme      = getTheme;
window.setTheme      = setTheme;
