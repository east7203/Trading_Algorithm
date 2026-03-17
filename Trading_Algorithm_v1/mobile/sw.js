const CACHE_NAME = 'trading-assist-mobile-v8';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icon.svg',
  'open-app.html',
  'open-app.js'
];

const APP_SHELL_PATHS = new Set([
  '/mobile',
  '/mobile/',
  '/mobile/index.html',
  '/mobile/styles.css',
  '/mobile/app.js',
  '/mobile/manifest.webmanifest',
  '/mobile/icon.svg',
  '/mobile/open-app.html',
  '/mobile/open-app.js'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isDocumentRequest =
    event.request.mode === 'navigate' || event.request.destination === 'document';
  const isAppShellAsset = requestUrl.origin === self.location.origin && APP_SHELL_PATHS.has(requestUrl.pathname);
  const isApiRequest =
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname !== '/mobile' &&
    !requestUrl.pathname.startsWith('/mobile/');

  if (isDocumentRequest || isAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/mobile/index.html') || caches.match('index.html'))
        )
    );
    return;
  }

  if (isApiRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('index.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const payload = event.data?.json?.() ?? {};
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });
      const hasVisibleClient = clientList.some((client) => client.visibilityState === 'visible');

      if (hasVisibleClient) {
        return;
      }

      await self.registration.showNotification(payload.title || 'Trading Assist', {
        body: payload.body || 'A new signal is ready to review.',
        tag: payload.tag || 'trading-assist-signal',
        icon: 'icon.svg',
        badge: 'icon.svg',
        data: {
          url: payload.url || '/mobile/'
        }
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl = new URL(event.notification.data?.url || '/mobile/', self.location.origin).toString();
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        const isMobileClient =
          clientUrl.origin === self.location.origin && (clientUrl.pathname === '/mobile/' || clientUrl.pathname === '/mobile');

        if (client.url === targetUrl && 'focus' in client) {
          await client.focus();
          return;
        }

        if (isMobileClient && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
