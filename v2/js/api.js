// Transport, auth guard, timeouts. Per bcn-v2-system-design.md §2: "Battle-
// tested" client behaviour carries over unchanged — this is a straight port
// of v1's js/session.js _apiFetch/_checkAuthError/apiGet/apiPost, with the
// DOM/screen coupling removed (no forceReLogin() reaching into the page
// directly; it goes through store instead). Error strings, timeout value and
// auth-handling logic are byte-for-byte what v1 has verified in production —
// do not "improve" the wording without re-verifying against the live
// Apps Script backend, the same way the upload-progress feature should have
// been checked before it shipped (see CLAUDE.md).
//
// Deliberately does NOT include XHR / upload-progress. Still fetch() only —
// this file's scope didn't change. Note for future work, not acted on here:
// CLAUDE.md's "Known impossibilities" reason was that Apps Script never
// answers a CORS preflight OPTIONS, and an xhr.upload listener forces one.
// Since B0 (see bcn-backend-b0-worker-cache.md), requests go through a
// Cloudflare Worker that DOES answer OPTIONS correctly (verified live) —
// the preflight blocker is gone. Actually adding upload-progress is a
// separate, unrequested UI change and CLAUDE.md's impossibility note should
// be updated to reflect this before anyone relies on it being still true.
//
// Config (API_URL, resolved from SCRIPT_URL/WORKER_URL) stays inline in
// index.html per CLAUDE.md's standing invariant — read here as a global,
// not imported.

const API_TIMEOUT = 15000; // ms — matches v1; Apps Script has been observed to
                            // take up to this long under load.

// Shared by every call: the backend signals a dead session or a revoked
// allow-list entry in the response body, not the HTTP status. On either auth
// error this clears the session token in the store (not the DOM/screen —
// that's app.js's job, via a store subscription) and rethrows with authCode
// so callers can distinguish "expired" from "denied" if they need to.
function _checkAuthError(data) {
  if (data && data.error === 'AUTH_EXPIRED') {
    store.set({ sessionToken: null, authError: 'AUTH_EXPIRED' });
    const err = new Error(t('errAuthExpired'));
    err.authCode = 'AUTH_EXPIRED';
    throw err;
  }
  if (data && data.error === 'AUTH_DENIED') {
    store.set({ sessionToken: null, authError: 'AUTH_DENIED' });
    const err = new Error(t('errAuthDenied'));
    err.authCode = 'AUTH_DENIED';
    throw err;
  }
  return data;
}

function _apiFetch(input, init) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT);
  return fetch(input, { ...init, signal: ctrl.signal })
    .then(r => {
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''}`);
      return r.json();
    })
    .then(_checkAuthError)
    .catch(e => {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error(`Request timed out after ${API_TIMEOUT / 1000}s — the server took too long to respond`);
      if (e instanceof TypeError)  throw new Error(`Network error — check your internet connection (${e.message})`);
      throw e;
    });
}

function apiGet(params) {
  if (!API_URL || API_URL.startsWith('YOUR_')) return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  const url = new URL(API_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('sessionToken', store.get().sessionToken || '');
  return _apiFetch(url, { redirect: 'follow' });
}

function apiPost(bodyObj) {
  if (!API_URL || API_URL.startsWith('YOUR_')) return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  return _apiFetch(API_URL, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({ ...bodyObj, sessionToken: store.get().sessionToken || '' }),
  });
}

// Exchange a one-time Google id_token for an app session token. Carries no
// session token itself — this IS the authentication step.
function apiAuthenticate(idToken, deviceInfo) {
  if (!API_URL || API_URL.startsWith('YOUR_')) return Promise.reject(new Error('SCRIPT_URL is not set — see README for setup instructions'));
  return _apiFetch(API_URL, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body:    JSON.stringify({
      action:        'authenticate',
      idToken,
      deviceId:      deviceInfo.deviceId,
      deviceLabel:   deviceInfo.label,
      userAgent:     deviceInfo.ua,
      existingToken: store.get().sessionToken || '',
    }),
  });
}

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b.
window.apiGet          = apiGet;
window.apiPost         = apiPost;
window.apiAuthenticate = apiAuthenticate;
