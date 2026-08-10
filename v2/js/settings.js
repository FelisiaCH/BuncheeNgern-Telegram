// Settings sheet — theme switcher (3.4) + accent presets (3.4b), per
// bcn-v2-phase3.3-periwinkle-identity.md's "Next" pointer and
// bcn-v2-phase3.4b-accent-presets.md. The grouped sidebar nav shell is the
// one piece of that "Next" pointer still not started.
//
// index.html's OLED button carries the literal text "OLED" directly (no
// data-i18n) — it has no v1 key (v1's theme toggle is 2-way, light/dark
// only) and isn't a translatable concept, same as "QR".

// Paints .on onto the segment/swatch matching the currently active theme/
// accent — called every time the sheet opens so it can never show a stale
// selection.
function renderSettings() {
  const activeTheme = getTheme();
  document.querySelectorAll('#settings-sheet .seg.theme').forEach(el => {
    el.classList.toggle('on', el.dataset.value === activeTheme);
  });
  const activeAccent = getAccent();
  document.querySelectorAll('#settings-sheet .accent-sw').forEach(el => {
    el.classList.toggle('on', el.dataset.value === activeAccent);
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
window.__actions.setAccentMode = el => {
  setAccent(el.dataset.value); // applies/clears data-accent on <html>, see config.js
  renderSettings();
};
