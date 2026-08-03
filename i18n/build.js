// 🔤 Build I18N in key-first shape from per-language parts (t() expects I18N[key][lang])
(function () {
  var parts = window.I18N_PARTS || {};
  var base  = parts.en || {};
  var langs = ['en', 'th', 'lo', 'vi', 'my', 'zh', 'ja', 'ko', 'id', 'ms', 'tl', 'km', 'hi', 'bn', 'es', 'fr', 'pt', 'de'];
  var per   = {};
  langs.forEach(function (l) { per[l] = Object.assign({}, base, parts[l] || {}); });
  var built = {};
  Object.keys(base).forEach(function (key) {
    built[key] = {};
    langs.forEach(function (l) { built[key][l] = per[l][key] || ''; });
  });
  window.I18N = built;
  // Fallback: if lang_meta.js failed to load, degrade to English-only selector
  window.LANGS = window.LANGS || { en: { flag: '🇺🇸', label: 'English' } };
})();
