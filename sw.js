// Offline-Speicher der App-Dateien (Berichte selbst liegen im Gerätespeicher, nicht hier)
const CACHE = 'arbeitsbericht-v4';
const DATEIEN = ['./', 'index.html', 'style.css', 'app.js', 'pdf.js', 'jspdf.umd.min.js', 'logo.png',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Erst Netz (damit Updates ankommen), ohne Netz aus dem Speicher
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // no-cache: immer beim Server nachfragen (GitHub Pages lässt Dateien sonst 10 Minuten im Browser-Cache)
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const kopie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, kopie));
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
