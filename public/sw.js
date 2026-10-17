// __BUILD_ID__ is replaced at build time by the stampServiceWorkerBuildId plugin in
// vite.config.js. Files in public/ are copied verbatim, so without that substitution this
// file's bytes would be identical on every deploy — and a browser only installs a new
// service worker when the bytes differ. That is what previously pinned users to an old
// build until they cleared their cache by hand.
const BUILD_ID = '__BUILD_ID__';
const CACHE_NAME = `sage-app-${BUILD_ID}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Take over immediately rather than waiting for every tab to close.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        // Every previous build's cache, not just one known old name. The old worker
        // compared against a constant that never changed, so it never deleted anything.
        cacheNames
          .filter((name) => name.startsWith('sage-app-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only. Supabase, Google Fonts and every other API stay untouched: caching
  // an authenticated API response would risk serving one user's data to the next.
  if (url.origin !== self.location.origin) return;

  // Never let the worker serve itself or the manifest from cache.
  if (url.pathname === '/sw.js') return;

  // Navigation is network-first. The app shell decides which hashed bundles load, so
  // serving it from cache first is what pinned users to the previous build: the stale
  // index.html referenced the previous build's JS, which was cached alongside it.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html')
          .then((cached) => cached || new Response('You are offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          })))
    );
    return;
  }

  // Static assets are safe to serve cache-first: their filenames are content-hashed per
  // build, and this whole cache is dropped the moment a new build activates.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => new Response('Network error', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' }
        }));
    })
  );
});
