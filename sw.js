// ══════════════════════════════════════════
//  VOLO SST — Service Worker
//  Cache-first pour assets, network-first pour API
// ══════════════════════════════════════════
const CACHE_NAME = 'volo-sst-v34.1';
const ASSETS = [
  '/index.html',
  '/agenda.html',
  '/caisses-stock.html',
  '/command-center.html',
  '/dashboard-superviseur.html',
  '/plan-travail.html',
  '/plan-sauvetage.html',
  '/pointage.html',
  '/presentation.html',
  '/qr.html',
  '/rapport-cnesst.html',
  '/lexique.html',
  '/mode-inspection.html',
  '/mode-terrain.html',
  '/asat.html',
  '/permis-espace-clos.html',
  '/tracker-chantier.html',
  '/data.js',
  '/cnesst-reglements.js',
  '/firebase-config.js',
  '/firebase-service.js',
  '/firebase-auth.js',
  '/volo-crypto.js',
  '/volo-network.js',
  '/volo-usage.js',
  '/volo-chat.js',
  '/volo-announce.js',
  '/volo-icons.js',
  '/error-monitor.js',
  '/logo.js',
  '/king-logo.js',
  '/eagle_tactic.png',
  '/eagle_crown.jpg',
  '/eagle.mp3',
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

  // Skip non-GET, non-http(s), Firebase, CDN dynamique, webhooks
  if (e.request.method !== 'GET') return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.hostname.includes('firebase')) return;
  if (url.hostname.includes('googleapis.com')) return;
  if (url.hostname.includes('gstatic.com')) return;
  if (url.hostname.includes('make.com')) return;
  if (url.hostname.includes('identitytoolkit')) return;
  if (url.hostname.includes('securetoken')) return;

  // HTML + JS — network first, fallback cache
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.js')) {
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
        if (res.ok && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
