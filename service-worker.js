const CACHE = 'buncheengern-v1.1.46';
const ASSETS = [
  './', './index.html',
  './favicon.svg',
  './favicon.ico',
  './favicon-96x96.png',
  './apple-touch-icon.png',
  './icon-192x192.png',
  './icon-512x512.png',
  './i18n/currencies.js',
  './i18n/lang_meta.js',
  './i18n/lang_en.js',
  './i18n/lang_th.js',
  './i18n/lang_lo.js',
  './i18n/lang_vi.js',
  './i18n/lang_my.js',
  './i18n/lang_zh.js',
  './i18n/lang_ja.js',
  './i18n/lang_ko.js',
  './i18n/lang_id.js',
  './i18n/lang_ms.js',
  './i18n/lang_tl.js',
  './i18n/lang_km.js',
  './i18n/lang_hi.js',
  './i18n/lang_bn.js',
  './i18n/lang_es.js',
  './i18n/lang_fr.js',
  './i18n/lang_pt.js',
  './i18n/lang_de.js',
  './css/app.css',
  './i18n/build.js',
  './js/core.js',
  './js/pickers.js',
  './js/session.js',
  './js/entry.js',
  './js/dashboard.js',
  './js/boot.js',
];

// A response is only usable if it's a real 200 AND its content-type matches
// what the path implies. Static hosts answer unknown or mid-deploy paths with a
// 200 HTML fallback; without this check those bytes get cached under a .js/.css
// URL and permanently break the app, because asset fetches are cache-first and
// never revalidate.
function typeOk(url, resp) {
  if (!resp || !resp.ok) return false;
  let path;
  try { path = new URL(url, self.location.origin).pathname; } catch (err) { return true; }
  const ct = (resp.headers.get('content-type') || '').toLowerCase();
  if (path.endsWith('.js'))  return ct.includes('javascript') || ct.includes('ecmascript');
  if (path.endsWith('.css')) return ct.includes('css');
  return true;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Validate every asset before it enters the cache. If any one is wrong we
    // abort the whole install: the previous service worker stays in control,
    // which is far better than activating with a poisoned cache.
    await Promise.all(ASSETS.map(async path => {
      const resp = await fetch(new Request(path, { cache: 'reload' }));
      if (!typeOk(path, resp)) {
        throw new Error('SW install aborted — bad response for ' + path +
                        ' (' + resp.status + ' ' + (resp.headers.get('content-type') || '?') + ')');
      }
      await c.put(path, resp);
    }));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for navigation/HTML so updates reach installed devices immediately.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const copy = resp.clone();   // clone synchronously — see note below
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets, with a self-healing guard: a cached response
  // whose content-type contradicts its path was poisoned by a host fallback
  // page, so ignore it and go to the network instead of serving broken bytes.
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached && typeOk(e.request.url, cached)) return cached;
    return fetch(e.request);
  })());
});
