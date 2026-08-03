// 🛠️ DOM & Format Helpers
const p2 = n  => String(n).padStart(2,'0');

function nowStamp() {
  const d = new Date();
  return `${p2(d.getDate())}-${p2(d.getMonth()+1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
function fmtN(n) {
  return new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n)||0);
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function safeUrl(u) {
  const s = String(u || '').trim();
  return /^https:\/\//i.test(s) ? s : '';
}
function showScr(id) {
  ['scr-load','scr-login','scr-app'].forEach(s => $(s).classList.toggle('hidden', s!==id));
}
// 💬 Toast, Overlay & Messages
function setMsg(id, html, type) {
  const el = $(id);
  if (!html) { el.classList.add('hidden'); return; }
  el.className = `msg ${type||'err'}`;
  el.innerHTML = html;
  el.classList.remove('hidden');
}
function showToast(msg, type) {
  $('toast-txt').textContent = msg;
  const t = $('toast');
  t.className = `toast${type ? ' '+type : ''}`;
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), TOAST_DURATION);
}
function showOv(msg) {
  $('ov-msg').textContent = msg || t('loadingGeneric');
  $('ov').classList.remove('hidden');
}
function hideOv() { $('ov').classList.add('hidden'); }

// 📡 API Request Layer
// When the backend reports the app session is gone (expired/invalid token) or the
// user is no longer allow-listed, drop straight to the login screen — the user
// signs in with Google again to mint a fresh 30-day session token.
function _apiFetch(input, init) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
  return fetch(input, { ...init, signal: ctrl.signal })
    .then(r => {
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}`);
      return r.json();
    })
    .then(data => {
      if (data && data.error === 'AUTH_EXPIRED') {
        forceReLogin();
        const err = new Error(t('errAuthExpired'));
        err.authCode = 'AUTH_EXPIRED';
        throw err;
      }
      if (data && data.error === 'AUTH_DENIED') {
        forceReLogin();
        const err = new Error(t('errAuthDenied'));
        err.authCode = 'AUTH_DENIED';
        throw err;
      }
      return data;
    })
    .catch(e => {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Request timed out after ${API_TIMEOUT / 1000}s — the server took too long to respond`);
      if (e instanceof TypeError)  throw new Error(`Network error — check your internet connection (${e.message})`);
      throw e;
    });
}
// Exchange a one-time Google id_token for an app session token. This IS the
// authentication step, so it carries no session token and bypasses the normal flow.
// Sends device info + any stored token so the backend can reuse this device's
// session (re-login / unlock) instead of minting a new row.
function apiAuthenticate(idToken) {
  if (SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  const stored = loadSession();
  const info   = getDeviceInfo();
  return _apiFetch(SCRIPT_URL, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({
      action:        'authenticate',
      idToken,
      deviceId:      getDeviceId(),
      deviceLabel:   info.label,
      userAgent:     info.ua,
      existingToken: A.sessionToken || (stored && stored.sessionToken) || '',
    }),
  });
}
function apiGet(params) {
  if (SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  const url = new URL(SCRIPT_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('sessionToken', A.sessionToken || '');
  return _apiFetch(url, { redirect:'follow' });
}
function apiPost(bodyObj) {
  if (SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  return _apiFetch(SCRIPT_URL, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({ ...bodyObj, sessionToken: A.sessionToken || '' }),
  });
}

// 📱 Device identity — a stable random id per device (how the backend recognizes
// "the same device") plus a best-effort human-readable label for the Sessions sheet.
const DEVICE_KEY = 'deviceId';
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
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
  if (/Android/.test(ua))               os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Windows/.test(ua))          os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua))            os = 'Linux';
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

// 💾 Session Storage — token is kept on LOCK (only memory is cleared); a hard
// LOGOUT clears it entirely. The 'locked' flag gates the optimistic restore.
const SESSION_KEY = 'userSession';
function saveSession(name, email, shop, sessionToken) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    name, email, shop, sessionToken, deviceId: getDeviceId(), locked: false,
  }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function lockSession() {
  const s = loadSession();
  if (s) { s.locked = true; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
}
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// 🔐 Google Sign-In (Identity Services)
// Exchange the one-time Google credential for an app session token, then enter the app.
function handleGoogleCredential(resp) {
  apiAuthenticate(resp.credential)
    .then(result => {
      // If a *different* user is signing in on this device, drop the previous
      // user's cached dashboard data. Same-user unlock keeps it (instant paint).
      const prev = loadSession();
      if (!prev || (prev.email || '').toLowerCase() !== (result.email || '').toLowerCase()) {
        clearDashCache();
      }
      A.me = result.name;
      A.userEmail = result.email;
      A.sessionToken = result.sessionToken;
      saveSession(A.me, A.userEmail, A.fd.shop, A.sessionToken);
      enterApp(A.me);
    })
    .catch(err => {
      // AUTH_DENIED → not allow-listed; anything else → generic sign-in failure.
      // Either way stay on the login screen (do not enterApp).
      showSignInWarn(err && err.authCode === 'AUTH_DENIED' ? 'errAuthDenied' : 'googleSignInError');
    });
}

function showSignInWarn(key) {
  const el = $('g-signin-warn');
  el.textContent = t(key);
  el.classList.remove('hidden');
}

function gsiLocale(lang) {
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'tl') return 'fil';
  return lang;
}

function initGoogleSignIn(retries = 20) {
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID_HERE') {
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
    google.accounts.id.renderButton($('g-signin-btn'), { theme: 'outline', size: 'medium', shape: 'pill', locale: gsiLocale(currentLang) });
  } catch (err) {
    showSignInWarn('googleSignInError');
  }
}

// 🚀 App Init & Bootstrap
async function init() {
  loadTheme();
  applyTranslations();
  initGoogleSignIn();

  const session = loadSession();
  if (session?.name && session?.email && session?.sessionToken && !session.locked) {
    // Returning user within the 30-day window, not locked — restore optimistically.
    // The first data fetch validates the token; if it's expired the normal
    // AUTH_EXPIRED handler drops back to the login screen.
    A.me = session.name;
    A.userEmail = session.email;
    A.sessionToken = session.sessionToken;
    loadDashCache();   // same user, same device → paint last-known dashboard instantly
    selectBranchSegment(session.shop);
    enterApp(session.name);
    return;
  }
  // No session, or locked → login screen (a Google sign-in unlocks/restores it).
  showScr('scr-login');
}

// 🚪 Enter App & Logout
function enterApp(name) {
  $('hdr-user').textContent = name;
  $('f-date-lbl').textContent = fmtDateTab(new Date());
  dashDate = new Date();
  // NOTE: the dashboard cache is intentionally NOT cleared here. enterApp runs on
  // both a same-user reload (keep cache — instant paint) and a fresh sign-in
  // (handled per-path: cleared in handleGoogleCredential only when the user
  // actually changes, and hydrated in init() on restore).
  selectBranchSegment(A.fd.shop);
  showScr('scr-app');
}

// LOCK — keep the stored token for reuse; just clear in-memory state and show
// the login screen. Signing in with Google re-verifies identity and unlocks.
function lockApp() {
  if (!confirm(t('confirmLock'))) return;
  lockSession();
  A.me = null;
  A.userEmail = '';
  A.sessionToken = null;
  showScr('scr-login');
}

// HARD LOGOUT — fully forget this device: wipe the stored token so nothing can
// be reused. For shared devices.
function doLogout() {
  if (!confirm(t('confirmLogout'))) return;
  clearSession();
  clearDashCache();   // shared-device hard logout — leave no cached financial data behind
  A.me = null;
  A.userEmail = '';
  A.sessionToken = null;
  A.fd.shop = BRANCHES[0];
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  showScr('scr-login');
}

function forceReLogin() {
  clearSession();
  clearDashCache();   // token expired/denied → forget this device's cached data too
  A.me = null;
  A.userEmail = '';
  A.sessionToken = null;
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  showScr('scr-login');
}

