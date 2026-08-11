const CACHE_NAME = 'multiapp-v2';
const CORE_ASSETS = [
  'index.html',
  'dashboard.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: la app depende de datos frescos de Supabase, el cache
// es solo un respaldo para que la shell cargue offline/con mala señal.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
