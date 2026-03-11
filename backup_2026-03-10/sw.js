// ══════════════════════════════════════════
//  VOLO SST — Service Worker
//  Cache-first pour assets, network-first pour API
// ══════════════════════════════════════════
const CACHE_NAME = 'volo-sst-v12.8';
const ASSETS = [
  '/agenda.html',
  '/index.html',
  '/caisses-stock.html',
  '/qr.html',
  '/pointage.html',
  '/data.js',
  '/logo.js',
  '/error-monitor.js',
  '/eagle_tactic.png',
  '/manifest.json'
];

// Install — cache les assets critiques
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — nettoie les vieux caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network-first pour les pages HTML et Firebase, cache-first pour le reste
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET, Firebase, CDN dynamique, webhooks
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('firebaseio.com')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('make.com')) return;

  // HTML pages — network first, fallback cache
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Autres assets — cache first, fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache les réponses valides (pas d'erreur, pas opaque)
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
