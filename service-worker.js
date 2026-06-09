const CACHE = 'fintrack-v4';
const ASSETS = ['./', './index.html'];

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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// 🔔 Background push notification from server
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data ? e.data.text() : '' }; }

  const title = data.title || 'FinTrack อัปเดตยอดเงิน';
  const opts  = {
    body:  data.body  || data.text || 'มีรายการใหม่',
    icon:  data.icon  || './icon-192x192.png',
    badge: data.badge || './icon-192x192.png',
    data:  data,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// 🔔 Bring app to foreground when notification is tapped
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
      if (existing) return existing.focus();
      return clients.openWindow('./');
    })
  );
});
