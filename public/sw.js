// miliconfig service worker — minimal and safe.
// • Cache-first ONLY for versioned build assets (/assets/*) and icons.
// • Never touches /api/* (always network).
// • Navigation requests go to the network; offline falls back to the shell.
const CACHE = 'miliconfig-v2'
const SHELL = ['./', '/index.html', '/manifest.webmanifest', '/pwa-icon-192.png', '/pwa-icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Versioned assets: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(e.request).then((hit) =>
        hit ?? fetch(e.request).then((resp) => {
          const copy = resp.clone()
          caches.open(CACHE).then((c) => c.put(e.request, copy))
          return resp
        }),
      ),
    )
    return
  }

  // Navigations & everything else: network-first, cached shell as fallback.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')))
  }
})
