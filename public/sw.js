/* mysabak service worker — caches the app shell so it opens offline.
   Bump CACHE when you change any of the files below.
   It sits at the site root so it can look after every page. */
const CACHE = 'mysabak-v11';
const SHELL = [
  './',
  './css/index.css',
  './scripts/config.js',
  './scripts/index.js',
  './manifest.webmanifest',
  './assets/sabak-logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/fonts/glyphs/GoogleSansText-Regular/0-255.pbf',
  './assets/fonts/glyphs/GoogleSansText-Medium/0-255.pbf',
  './assets/fonts/glyphs/GoogleSansText-Bold/0-255.pbf',
  './assets/fonts/glyphs/GoogleSansText-Italic/0-255.pbf',
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
// That includes the map label fonts (assets/fonts/glyphs): a small, fixed set.
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
