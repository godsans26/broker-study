'use strict';
const VERSION = '__VERSION__';
const PREFIX = 'broker-study:' + self.registration.scope + ':';
const CACHE = PREFIX + VERSION;
const FILES = __PRECACHE__;
const URLS = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS.map(url => new Request(url, {cache: 'reload'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the immediately previous generation for already-open pages.
    const old = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
    await Promise.all(old.slice(0, Math.max(0, old.length - 1)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never intercept auth, progress API, cross-origin requests, PDFs, or downloads.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname === new URL('./', self.registration.scope).pathname) url.pathname += 'index.html';
  url.search = ''; url.hash = '';
  if (!URLS.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url.href);
    if (hit) return hit;
    return fetch(event.request);
  })());
});
