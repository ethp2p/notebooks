/// <reference lib="webworker" />
const sw = self as unknown as ServiceWorkerGlobalScope;

const ASSET_CACHE = 'observatory-assets-v1';
const DATA_CACHE = 'observatory-data-v1';

sw.addEventListener('install', () => sw.skipWaiting());
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()));

sw.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/data/') || url.pathname.endsWith('.arrow')) {
    e.respondWith(cacheFirst(DATA_CACHE, e.request));
    return;
  }
  if (url.pathname.match(/\.(js|css|woff2|svg|png)$/)) {
    e.respondWith(cacheFirst(ASSET_CACHE, e.request));
    return;
  }
  if (url.pathname === '/registry.json' || url.pathname === '/dates.json') {
    e.respondWith(staleWhileRevalidate(DATA_CACHE, e.request));
    return;
  }
});

async function cacheFirst(name: string, req: Request): Promise<Response> {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(name: string, req: Request): Promise<Response> {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const networkFetch = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  return hit ?? networkFetch;
}

export {};
