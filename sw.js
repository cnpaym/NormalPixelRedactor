'use strict';
/* Service worker: редактор открывается без сети.
   Стратегия «сначала сеть»: при наличии интернета всегда берётся свежая версия
   и кладётся в кеш; без сети файлы отдаются из кеша. Работает только на http/https. */
const CACHE = 'npr-cache-v3';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/util.js', 'js/document.js', 'js/history.js', 'js/selection.js', 'js/ui.js', 'js/view.js', 'js/tools.js',
  'js/ops.js', 'js/io.js', 'js/palette.js', 'js/color.js', 'js/layers-ui.js', 'js/gradient-presets.js', 'js/gradient.js', 'js/refs.js', 'js/frames.js', 'js/fx.js', 'js/blackjack.js',
  'js/input.js', 'js/app.js',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })));
});
