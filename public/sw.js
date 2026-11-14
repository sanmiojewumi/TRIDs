// Cache-first service worker so the app opens instantly and works offline.
// Bump CACHE when shipping an update so devices pick up the new files.
const CACHE = 'invoice-desk-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => fetch('./index.html', { cache: 'reload' }).then((res) => cache.put('./index.html', res.clone()).then(() => res)))
      .then((res) => res.text())
      .then((html) => {
        const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]);
        return caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './icon.svg', ...assets]));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        }),
    ),
  );
});
