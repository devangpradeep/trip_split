const APP_SHELL_CACHE = 'tripsplit-shell-v2';
const RUNTIME_CACHE = 'tripsplit-runtime-v2';
const APP_SHELL_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).catch(() => {
      // In dev mode (Vite), static assets don't exist at these paths — that's fine.
      // The SW still installs and can handle push events.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isViteDevRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put('/index.html', responseClone));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(RUNTIME_CACHE);
          return (await cache.match('/index.html')) || caches.match('/index.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      });
    })
  );
});

const isViteDevRequest = (url) => (
  url.hostname === 'localhost' &&
  (
    url.port === '5173' ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.includes('/node_modules/.vite/')
  )
);

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || 'Tripsplit';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: {
      url: payload.url || '/',
      notificationId: payload.notification_id
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => client.url === targetUrl);
      if (matchingClient) {
        return matchingClient.focus();
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
