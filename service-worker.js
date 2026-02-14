const CACHE_NAME = 'liste-courses-v2'; // Incrémentez ce numéro à chaque mise à jour
const urlsToCache = [
  './liste-courses.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Installation du Service Worker
self.addEventListener('install', function(event) {
  console.log('[Service Worker] Installation en cours...');
  // Force le nouveau service worker à s'activer immédiatement
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[Service Worker] Mise en cache des fichiers');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activation du Service Worker
self.addEventListener('activate', function(event) {
  console.log('[Service Worker] Activation');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      // Prend le contrôle immédiatement
      return self.clients.claim();
    })
  );
});

// Interception des requêtes - Strategy: Network First, then Cache
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Si la réponse réseau est valide, on la met en cache
        if (response && response.status === 200) {
          var responseToCache = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(function() {
        // Si le réseau échoue, on utilise le cache
        return caches.match(event.request).then(function(response) {
          return response || new Response('Offline - contenu non disponible');
        });
      })
  );
});

// Envoyer un message quand une nouvelle version est disponible
self.addEventListener('message', function(event) {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
