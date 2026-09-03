/* Vervox Service Worker — offline-first shell caching + Web Push alarm delivery. */
const VERSION = 'vervox-v3';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Strategy:
   - navigations: network first, fall back to cached shell (offline-first UX)
   - same-origin GET assets: stale-while-revalidate
   - everything else: passthrough */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Bypass service worker entirely for Vite HMR, dev scripts, and WebSocket tokens
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/api/') ||
    url.search.includes('token=')
  ) {
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

/* Web Push — alarms delivered by the server / Firebase Cloud Messaging. */
self.addEventListener('push', (event) => {
  let payload = { title: 'Vervox alarm', body: 'A scheduled task is due.', tag: 'vervox-alarm' };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || 'vervox-alarm',
      icon: '/icon.svg',
      badge: '/icon.svg',
      requireInteraction: true,
      data: { url: payload.url || '/index.html?view=today' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/* Local (no-server) alarms: the page asks the SW to raise a notification on its behalf,
   which keeps working even when the tab is backgrounded. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'VERVOX_NOTIFY') {
    event.waitUntil(
      self.registration.showNotification(data.title || 'Vervox', {
        body: data.body || '',
        tag: data.tag || 'vervox-local',
        icon: '/icon.svg',
        badge: '/icon.svg',
        requireInteraction: true,
        data: { url: '/index.html?view=today' },
      })
    );
  }
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});
