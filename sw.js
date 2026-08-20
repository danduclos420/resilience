/* Résilience — service worker.
   Coquille en cache d'abord (l'app s'ouvre sans reseau).
   Audio en cache au fil de l'ecoute : on ne telecharge jamais 15 Mo d'avance. */
var VERSION = 'resilience-v3';
var COQUILLE = VERSION + '-coquille';
var MEDIA = VERSION + '-media';

var FICHIERS = [
  './', './index.html', './app.css', './app.js', './data.js',
  './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(COQUILLE)
      .then(function (c) { return c.addAll(FICHIERS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (cles) {
      return Promise.all(cles.map(function (k) {
        if (k !== COQUILLE && k !== MEDIA) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // polices Google : laissees au reseau

  // audio : on sert depuis le cache si present, sinon on telecharge et on garde.
  // Pas de mise en cache des reponses 206 (requetes par plage) : elles sont partielles.
  if (/\.mp3$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(MEDIA).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (rep) {
            if (rep.ok && rep.status === 200) cache.put(req, rep.clone());
            return rep;
          });
        });
      })
    );
    return;
  }

  // coquille : cache d'abord, puis rafraichissement silencieux en arriere-plan
  e.respondWith(
    caches.match(req).then(function (hit) {
      var reseau = fetch(req).then(function (rep) {
        if (rep.ok) {
          var copie = rep.clone();
          caches.open(COQUILLE).then(function (c) { c.put(req, copie); });
        }
        return rep;
      }).catch(function () {
        return hit || caches.match('./index.html');
      });
      return hit || reseau;
    })
  );
});
