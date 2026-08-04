// Runtime translation. Per bcn-v2-system-design.md §2, the 18 language files
// and the merge step (i18n/build.js) carry over unchanged — this module does
// NOT re-implement that; v2/index.html loads the existing i18n/lang_*.js and
// i18n/build.js from their current location, same as v1, so window.I18N and
// window.LANGS exist before this file runs. This module is only the
// consumption side: t(), language switching, and applying translations to
// the DOM via data-i18n attributes.
//
// Unlike v1's applyTranslations() (js/core.js), this does NOT call any
// screen-specific render function directly (renderBranchSegments,
// renderCurrencyPicker, refreshDashUI, ...) — v1 needed that because state
// lived partly in the DOM. Here, a language change is just a store.set();
// screens (Phase 1+) subscribe to the store and re-render themselves, per
// §7 point 1. That's the actual point of introducing store.js.

const LANG_KEY     = 'appLang';
const DEFAULT_LANG = 'th'; // matches v1 — primary language for this deployment

function detectDeviceLang() {
  const tags = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || ''];
  for (let i = 0; i < tags.length; i++) {
    const base = String(tags[i] || '').split('-')[0].toLowerCase();
    if (window.LANGS && window.LANGS[base]) return base;
  }
  return 'en';
}

function initLang() {
  const saved = localStorage.getItem(LANG_KEY);
  const lang  = (window.LANGS && window.LANGS[saved]) ? saved : detectDeviceLang();
  store.set({ lang });
  return lang;
}

function t(key, vars) {
  const lang  = store.get().lang || DEFAULT_LANG;
  const entry = window.I18N ? window.I18N[key] : null;
  let str = entry ? (entry[lang] ?? entry[DEFAULT_LANG] ?? entry.en ?? '') : key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replaceAll(`{${k}}`, String(v)); });
  return str;
}

function setLang(lang) {
  if (!window.LANGS || !window.LANGS[lang] || lang === store.get().lang) return;
  localStorage.setItem(LANG_KEY, lang);
  store.set({ lang }); // subscribers (screens) re-render with the new t()
}

// Generic, screen-agnostic pass — the same four data-i18n-* attribute forms
// v1 used. Call this from a store subscriber whenever `lang` changes.
function applyTranslationsToDom() {
  document.documentElement.lang = store.get().lang || DEFAULT_LANG;
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-optional]').forEach(el => {
    const txt = t(el.dataset.i18nOptional);
    el.textContent = txt;
    el.classList.toggle('hidden', !txt);
  });
}
