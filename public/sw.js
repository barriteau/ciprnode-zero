const CACHE_NAME = 'ciprface-20260330030515';
const STATIC_ASSETS = [
  '/css/htr.css',
  '/css/reset.css',
  '/css/font-Libertinus.css',
  '/css/font-Poller-One.css',
  '/css/font-Iosevka.css',
  '/css/typography.css',
  '/css/icons.css',
  '/css/main.css',
  '/css/media-queries.css',
  '/css/highlight.js/xcode.css',
  '/js/ciprnode.js',
  '/js/htmx.js',
  '/favicon.ico',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    // Take control of all open tabs immediately so we don't
    // need a second page load after SKIP_WAITING + controllerchange.
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Network first falling back to cache logic for GET requests
  if (event.request.method === 'GET' && !event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
