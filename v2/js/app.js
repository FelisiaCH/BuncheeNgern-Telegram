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
  // Both screens carry their own .mini-nav copy — keep every instance in sync.
  document.querySelectorAll('.mini-nav-btn[data-action="navRecord"]').forEach(b => b.classList.toggle('on', screen === 'entry'));
  document.querySelectorAll('.mini-nav-btn[data-action="navDash"]').forEach(b => b.classList.toggle('on', screen === 'dash'));
}

window.__actions.navRecord = () => store.set({ screen: 'entry' });
window.__actions.navDash   = () => { store.set({ screen: 'dash' }); ensureDashLoaded(); };

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
