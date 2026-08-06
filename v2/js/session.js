// Session & device identity — the missing half of v2's auth. api.js already
// had apiAuthenticate() and already set { sessionToken:null, authError } on
// AUTH_EXPIRED/AUTH_DENIED, but nothing consumed authError and nothing
// minted, persisted, or restored a session, so sessionToken was always ''
// and every request came back AUTH_EXPIRED. Ported from v1's js/session.js
// (device identity, save/load/lock/clear, the Google Sign-In flow),
// converted to store-based state — no A.* globals, no $/showScr. Per
// bcn-v2-phase1.5-session-auth.md §"v2/js/session.js".
//
// Store contract this file writes (see the task doc's table): screen,
// sessionToken, staffName, userEmail, authError. entry.js's buildPayload()
// reads state.staffName/state.userEmail directly — those exact top-level
// names are the contract, not a nested user object.

const DEVICE_KEY  = 'bcn2_device';
const SESSION_KEY = 'bcn2_session';

// ── Device identity — a stable random id per device, generated once and
// persisted. Deliberately NOT seeded from v1's `deviceId`: a device id
// identifies one install to the backend, and a session token is a
// credential — sharing either would let v1 and v2 collide on one Sessions
// row, so either app's logout/lock would invalidate the other. Unlike
// branches/currencies (settings, safe to copy), auth starts fresh here. ──
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem(DEVICE_KEY, id); } catch { /* storage blocked — id stays in-memory this load */ }
  }
  return id;
}

// Ported unchanged from v1 js/session.js — best-effort browser/OS/model
// label for the Sessions sheet; nothing functional depends on it being right.
function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (/Edg\//.test(ua))                 browser = 'Edge';
  else if (/SamsungBrowser\//.test(ua)) browser = 'Samsung Internet';
  else if (/OPR\/|Opera/.test(ua))      browser = 'Opera';
  else if (/Firefox\//.test(ua))        browser = 'Firefox';
  else if (/Chrome\//.test(ua))         browser = 'Chrome';
  else if (/Safari\//.test(ua))         browser = 'Safari';
  let os = '';
  if (/Android/.test(ua))                 os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua))   os = 'iOS';
  else if (/Windows/.test(ua))            os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua))              os = 'Linux';
  let model = '';
  if (/iPhone/.test(ua))      model = 'iPhone';
  else if (/iPad/.test(ua))   model = 'iPad';
  else {
    const m = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|[);])/); // "...; RMX3301)" → RMX3301
    if (m && m[1]) {
      const cand = m[1].trim();
      if (cand.length >= 2 && cand.toLowerCase() !== 'wv' && cand !== 'K') model = cand;
    }
  }
  let label = browser;
  if (os)    label += ' on ' + os;
  if (model) label += ' (' + model + ')';
  return { label, ua };
}

// ── Session storage — { staffName, userEmail, sessionToken, locked }. v1's
// `shop` is dropped: branch memory is an entry-state concern, out of scope
// here. ──
function saveSession(staffName, userEmail, sessionToken) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ staffName, userEmail, sessionToken, locked: false }));
  } catch { /* storage blocked — session lives in the store for this load only */ }
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
// Lock keeps the stored token — a lock is a client-side UX gate (matching
// v1: only forgetDevice() below actually revokes anything), not a token
// revocation, so unlock on the SAME device reuses it via apiAuthenticate's
// existingToken instead of minting a fresh session row. api.js reads
// existingToken from store.get().sessionToken, so restoreSession() (below)
// must keep a locked session's token in the store, not just in storage.
function lockSession() {
  const s = loadSession();
  if (!s) return;
  s.locked = true;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage blocked — nothing to clear */ }
}

// Synchronous restore from storage — called before the first paint (app.js)
// so a signed-in user never sees the login screen flash. Does NOT validate
// the token against the backend; a stale one surfaces through app.js's
// authError handling on the first real request.
function restoreSession() {
  const s = loadSession();
  if (!s || !s.sessionToken) { store.set({ screen: 'login' }); return; }
  if (s.locked) {
    store.set({ sessionToken: s.sessionToken, staffName: s.staffName, userEmail: s.userEmail, screen: 'locked' });
  } else {
    store.set({ sessionToken: s.sessionToken, staffName: s.staffName, userEmail: s.userEmail, screen: 'entry' });
  }
}

// v1's forceReLogin() minus DOM — app.js's onAuthError() owns the
// store/screen side of an auth failure; this just revokes locally.
function forgetDevice() {
  clearSession();
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
}

// ── Auth warning — shared by both screens' warn slots (#g-signin-warn on
// login, #g-signin-warn-locked on locked). Sets both regardless of which
// screen is active; only the visible one is ever seen, and this avoids
// needing to know the current screen. ──
function showSignInWarn(key) {
  const msg = t(key);
  ['g-signin-warn', 'g-signin-warn-locked'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  });
}
function hideSignInWarn() {
  ['g-signin-warn', 'g-signin-warn-locked'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

// ── Google Sign-In (Identity Services) — ported from v1 js/session.js,
// including the retry loop (the GSI script loads async/defer and
// google.accounts.id may not exist yet). Renders into both #g-signin-btn
// (login) and #g-signin-btn-locked (locked) — the locked screen's button
// re-runs the same callback, which is what "unlock" actually is here. ──
function gsiLocale(lang) {
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'tl') return 'fil';
  return lang;
}

function handleGoogleCredential(resp) {
  const { label, ua } = getDeviceInfo();
  apiAuthenticate(resp.credential, { deviceId: getDeviceId(), label, ua })
    .then(result => {
      saveSession(result.name, result.email, result.sessionToken);
      store.set({
        sessionToken: result.sessionToken,
        staffName:    result.name,
        userEmail:    result.email,
        screen:       'entry',
        authError:    null,
      });
      hideSignInWarn();
    })
    .catch(err => {
      showSignInWarn(err && err.authCode === 'AUTH_DENIED' ? 'errAuthDenied' : 'googleSignInError');
      // Stay on the current screen — do not touch state.screen on failure.
    });
}

function initGoogleSignIn(retries = 20) {
  if (typeof GOOGLE_CLIENT_ID === 'undefined' || GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
    showSignInWarn('googleSignInNotConfigured');
    return;
  }
  if (!window.google?.accounts?.id) {
    if (retries <= 0) { showSignInWarn('googleSignInError'); return; }
    setTimeout(() => initGoogleSignIn(retries - 1), 300);
    return;
  }
  try {
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential, auto_select: true });
    ['g-signin-btn', 'g-signin-btn-locked'].forEach(id => {
      const el = document.getElementById(id);
      if (el) google.accounts.id.renderButton(el, { theme: 'outline', size: 'medium', shape: 'pill', locale: gsiLocale(store.get().lang) });
    });
  } catch {
    showSignInWarn('googleSignInError');
  }
}

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b. Only what
// app.js (or a later phase) actually reaches for — see the task doc's
// export list; lockSession/clearSession are exported unused this phase,
// for Phase 3's lock/logout UI to wire up.
window.initGoogleSignIn = initGoogleSignIn;
window.restoreSession   = restoreSession;
window.forgetDevice     = forgetDevice;
window.showSignInWarn   = showSignInWarn;
window.lockSession      = lockSession;
window.clearSession     = clearSession;
