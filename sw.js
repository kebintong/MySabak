/* mysabak service worker — caches the app shell so it opens offline.
   Bump CACHE when you change any of the files below.
   It sits at the top of the site so it can look after every page. */
const CACHE = 'mysabak-v43';
const SHELL = [
  '/',
  '/css/base.css',
  '/css/index.css',
  '/js/config.js',
  '/js/api.js',
  '/js/map.js',
  '/js/app.js',
  '/js/ui.js',
  '/js/money.js',
  '/js/cart.js',
  '/js/demo-data.js',
  '/js/menu.js',
  '/js/placeholders.js',
  '/js/shop-map.js',
  '/manifest.webmanifest',
  '/assets/images/logo.svg',
  '/assets/images/favicon.svg',
  '/assets/images/map-bg.svg',
  '/assets/images/icons.svg',
  '/assets/images/mascot.svg',
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
