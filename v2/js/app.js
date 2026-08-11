// Boot: theme, language, session restore, mount, Google Sign-In, one store
// subscription, one initial render. Per bcn-v2-phase1-entry-prompt.md §5 and
// bcn-v2-phase1.5-session-auth.md's boot rewrite.
//
// mountEntryScreen() runs unconditionally (step 4) regardless of which
// screen restoreSession() lands on — it only caches DOM refs and populates
// currency/branch dropdowns from config.js, no auth or fetch involved, so
// it's safe to always mount. Screen visibility is purely a function of
// state.screen via routeScreen() below; nothing else needs to re-mount on
// sign-in/unlock.

document.documentElement.setAttribute('data-theme', getTheme());
// data-accent applied the same way (3.4b) — periwinkle omits the attribute
// entirely (see setAccent()'s comment), so only call setAttribute when the
// stored preset actually needs a tokens.css override.
if (getAccent() !== 'periwinkle') document.documentElement.setAttribute('data-accent', getAccent());
initLang();
restoreSession(); // before first paint — stops a signed-in user seeing a login flash
mountEntryScreen();
mountDashboard(); // cheap — DOM refs + branch options only, no fetch; entering the
                   // screen (navDash) is what actually triggers the first load
initGoogleSignIn();

// Toggles .hidden on the four screens by state.screen (defaults to
// 'login' if unset). When locked, paints the signed-in name into
// #locked-user. Does NOT touch the sign-in warn slots — those are session.js's
// concern (shown on failure, hidden on success), not screen-routing's.
function routeScreen(state) {
  const screen = state.screen || 'login';
  document.getElementById('screen-login')?.classList.toggle('hidden', screen !== 'login');
  document.getElementById('screen-locked')?.classList.toggle('hidden', screen !== 'locked');
  document.getElementById('screen-entry')?.classList.toggle('hidden', screen !== 'entry');
  document.getElementById('screen-dash')?.classList.toggle('hidden', screen !== 'dash');
  if (screen === 'locked') {
    const el = document.getElementById('locked-user');
    if (el) el.textContent = state.staffName || '';
  }
  // #app-nav (Phase 3.4c) — one hoisted instance, shown only for entry/dash.
  const navShown = screen === 'entry' || screen === 'dash';
  document.getElementById('app-nav')?.classList.toggle('hidden', !navShown);
  document.querySelectorAll('#app-nav [data-action="navRecord"]').forEach(b => b.classList.toggle('on', screen === 'entry'));
  document.querySelectorAll('#app-nav [data-action="navDash"]').forEach(b => b.classList.toggle('on', screen === 'dash'));
  // Popup state is meaningless once the nav itself is hidden (e.g. a session
  // expiry bounces to 'login' mid-popup) — don't let .open survive to the
  // next time #app-nav reappears.
  if (!navShown) window.__actions.closeNavMenu();
}

window.__actions.navRecord = () => { store.set({ screen: 'entry' }); window.__actions.closeNavMenu(); };
window.__actions.navDash   = () => { store.set({ screen: 'dash' }); ensureDashLoaded(); window.__actions.closeNavMenu(); };

// #app-nav's mobile 3-dot popup (Management group + Settings). Desktop CSS
// keeps .nav-secondary always visible regardless of .open — see components.css.
// openNavMenu is a real toggle: .nav-primary/.nav-more sit above the backdrop
// (z-index 95 vs 90, see components.css) so ⋮ no longer falls through to the
// backdrop's close-on-click — it must close the popup itself when already open.
window.__actions.openNavMenu = () => {
  const sec = document.querySelector('.nav-secondary');
  if (sec?.classList.contains('open')) { window.__actions.closeNavMenu(); return; }
  sec?.classList.add('open');
  document.querySelector('.nav-backdrop')?.classList.add('open');
  document.querySelector('.nav-more')?.setAttribute('aria-expanded', 'true');
};
window.__actions.closeNavMenu = () => {
  document.querySelector('.nav-secondary')?.classList.remove('open');
  document.querySelector('.nav-backdrop')?.classList.remove('open');
  document.querySelector('.nav-more')?.setAttribute('aria-expanded', 'false');
};
// Mirrors settingsBackdrop's guard: el is always .nav-backdrop (the delegated
// match); e.target === el only when the backdrop itself was clicked.
window.__actions.navMenuBackdrop = (el, e) => { if (e.target === el) window.__actions.closeNavMenu(); };

// api.js's _checkAuthError already does store.set({sessionToken:null,
// authError}) on AUTH_EXPIRED/AUTH_DENIED — this is the listener that was
// missing. forgetDevice() revokes locally; AUTH_DENIED additionally warns
// (not allow-listed, distinct from a merely expired token). The final
// store.set clears authError, which re-fires this subscriber on the clean
// path — the `if (state.authError)` early-return in the subscriber below
// stops that from looping.
function onAuthError(code) {
  forgetDevice();
  if (code === 'AUTH_DENIED') showSignInWarn('errAuthDenied');
  store.set({ sessionToken: null, staffName: null, userEmail: null, screen: 'login', authError: null });
}

store.subscribe(state => {
  if (state.authError) { onAuthError(state.authError); return; }
  applyTranslationsToDom();
  routeScreen(state);
  renderEntry(state);     // no-ops until mountEntryScreen() has run — guarded in entry.js
  renderDashboard(state); // no-ops until mountDashboard() has run — guarded in dashboard.js
});

applyTranslationsToDom();
routeScreen(store.get());
renderEntry(store.get());
renderDashboard(store.get());
