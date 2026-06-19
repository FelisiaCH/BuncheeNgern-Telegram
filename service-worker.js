const CACHE = 'buncheengern-v1.1.21';
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
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
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
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          return resp;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (icons, lang_*.js, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
