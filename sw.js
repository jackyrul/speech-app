'use strict';

// При каждом деплое меняем версию — старый кэш удаляется в activate.
const CACHE = 'speech-v3';
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/data.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // GitHub API — всегда сеть (Gist sync), не кэшируем
  if (e.request.url.includes('api.github.com')) return;
  if (e.request.method !== 'GET') return;

  // Network-first: онлайн — всегда свежая версия (обновления видны сразу),
  // офлайн — отдаём из кэша. Так исчезает проблема «запушил, но не обновилось».
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});
