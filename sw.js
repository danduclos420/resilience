/* Résilience — service worker.
   Coquille : reseau d'abord, cache en secours — l'app est toujours a jour quand
   il y a du signal, et elle s'ouvre quand meme sans reseau.
   Audio : cache d'abord, garde apres une premiere ecoute. */
var VERSION = 'resilience-v6';
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

/* ── audio ───────────────────────────────────────────────────────────────────
   Une balise <audio> demande des plages d'octets ("Range: bytes=0-"), et le
   serveur repond 206 avec un fragment. Un fragment ne se met pas en cache : on
   garde donc le fichier entier sous une cle sans en-tete Range, et on decoupe
   nous-memes la plage demandee a partir du cache. */
function decouper(rep, plage) {
  return rep.arrayBuffer().then(function (buf) {
    var m = /bytes=(\d*)-(\d*)/.exec(plage) || [];
    var total = buf.byteLength;
    var debut = m[1] ? parseInt(m[1], 10) : 0;
    var fin = m[2] ? parseInt(m[2], 10) : total - 1;
    if (isNaN(debut) || debut >= total) debut = 0;
    if (isNaN(fin) || fin >= total) fin = total - 1;
    return new Response(buf.slice(debut, fin + 1), {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': rep.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(fin - debut + 1),
        'Content-Range': 'bytes ' + debut + '-' + fin + '/' + total,
        'Accept-Ranges': 'bytes'
      }
    });
  });
}

function servirAudio(req, evt) {
  var cle = new Request(req.url, { mode: 'same-origin', credentials: 'same-origin' });
  return caches.open(MEDIA).then(function (cache) {
    return cache.match(cle).then(function (hit) {
      var plage = req.headers.get('range');
      if (hit) return plage ? decouper(hit.clone(), plage) : hit;

      // pas encore garde : on sert le reseau tout de suite, et on telecharge le
      // fichier entier en arriere-plan. waitUntil est indispensable : sans lui le
      // worker est arrete avant la fin du telechargement et rien n'est garde.
      var complet = fetch(cle).then(function (rep) {
        if (rep && rep.ok && rep.status === 200) return cache.put(cle, rep.clone()).then(function () { return rep; });
        return rep;
      }).catch(function () { return null; });
      if (evt && evt.waitUntil) evt.waitUntil(complet);

      return fetch(req).catch(function () {
        // hors ligne et rien en cache : on tente quand meme le telechargement complet
        return complet.then(function (rep) {
          if (!rep) return new Response('', { status: 504 });
          return plage ? decouper(rep.clone(), plage) : rep;
        });
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // polices Google : laissees au reseau

  if (/\.mp3$/i.test(url.pathname)) { e.respondWith(servirAudio(req, e)); return; }

  // Coquille : RESEAU d'abord, cache en secours.
  // L'album avance a chaque titre termine : servir le cache en premier ferait
  // voir a D.M.P la version precedente. Hors ligne, le cache prend le relais.
  e.respondWith(
    fetch(req).then(function (rep) {
      if (rep && rep.ok && rep.status === 200) {
        var copie = rep.clone();
        e.waitUntil(caches.open(COQUILLE).then(function (c) { return c.put(req, copie); }));
      }
      return rep;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
