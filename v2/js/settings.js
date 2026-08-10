// Settings sheet — theme switcher only, per bcn-v2-phase3.3-periwinkle-
// identity.md's "Next" pointer: "3.4 — sidebar + settings (incl. the theme
// switcher wired to setTheme) + accent presets." This slice ships the
// switcher; the grouped sidebar nav shell and accent presets are a later
// slice, not started here.
//
// ── v2-local string — OLED has no v1 key (v1's theme toggle is 2-way,
// light/dark only) and isn't a translatable concept, same as "QR" — folded
// into shared i18n/lang_*.js only if a real translation need shows up later,
// same convention dashboard.js set for DASH_STRINGS.
const SETTINGS_STRINGS = { themeOled: 'OLED' };

function mountSettings() {
  const btn = document.getElementById('theme-oled-btn');
  if (btn) btn.textContent = SETTINGS_STRINGS.themeOled;
}

// Paints .on onto the segment matching the currently active theme — called
// every time the sheet opens so it can never show a stale selection.
function renderSettings() {
  const active = getTheme();
  document.querySelectorAll('#settings-sheet .seg.theme').forEach(el => {
    el.classList.toggle('on', el.dataset.value === active);
  });
}

window.__actions.openSettings = () => {
  renderSettings();
  document.getElementById('settings-sheet')?.classList.remove('hidden');
};
window.__actions.closeSettings = () => {
  document.getElementById('settings-sheet')?.classList.add('hidden');
};
// Backdrop click closes — ported guard from entry.js's confirmBackdrop
// (el is the delegated match, always #settings-sheet here; e.target === el
// only when the backdrop itself was clicked, not a bubble from the card).
window.__actions.settingsBackdrop = (el, e) => { if (e.target === el) window.__actions.closeSettings(); };
window.__actions.setThemeMode = el => {
  setTheme(el.dataset.value); // applies data-theme to <html> itself, see config.js
  renderSettings();
};

mountSettings();
