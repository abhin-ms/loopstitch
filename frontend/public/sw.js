// Minimal service worker — its only job is to satisfy PWA installability
// criteria (Chrome/Android requires an active SW with a fetch handler
// before it will fire `beforeinstallprompt`). No offline caching is
// attempted here; every request just passes straight through to the
// network so the app always sees live data.
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
