/* mysabak service worker — caches the app shell so it opens offline.
   Bump CACHE when you change any of the files below.
   It lives in assets/js/ but looks after the whole site: app.js registers it with
   scope '/', which the server allows with a Service-Worker-Allowed: / header
   (assets/dev/worker.js on Cloudflare, serve.py locally). */
const CACHE = 'mysabak-v25';
const SHELL = [
  '/',
  '/assets/css/style.css',
  '/assets/js/config.js',
  '/assets/js/api.js',
  '/assets/js/map.js',
  '/assets/js/app.js',
  '/assets/js/ui.js',
  '/assets/js/money.js',
  '/assets/js/cart.js',
  '/assets/js/demo-data.js',
  '/assets/js/menu.js',
  '/assets/js/placeholders.js',
  '/assets/js/shop-map.js',
  '/assets/manifest.webmanifest',
  '/assets/images/logo.svg',
  '/assets/images/favicon.svg',
  '/assets/images/map-bg.svg',
  '/assets/images/icons.svg',
  '/assets/images/icons/icon-192.png',
  '/assets/images/icons/icon-512.png',
  '/assets/fonts/GoogleSansText-Regular/0-255.pbf',
  '/assets/fonts/GoogleSansText-Medium/0-255.pbf',
  '/assets/fonts/GoogleSansText-Bold/0-255.pbf',
  '/assets/fonts/GoogleSansText-Italic/0-255.pbf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for our own files (so updates show up), cache as fallback.
// That includes the map label fonts (assets/fonts): a small, fixed set.
// Google Fonts: cache first.
// TomTom (/api/tomtom/…: tiles, search, routes) and MapLibre (CDN) go straight to the network:
// MapLibre keeps its own tile cache; caching tiles here would grow without limit.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }))
    );
    return;
  }

  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
  }
});
