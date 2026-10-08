const CACHE_NAME = 'setpoint-v4'
const STATIC_ASSETS = [
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  // Solo peticiones del propio sitio: el backend (Neon Auth, Data API) y las
  // fuentes van directo a la red, sin pasar por el service worker
  if (new URL(event.request.url).origin !== self.location.origin) return
  // No interceptar assets dinámicos de Next.js/Turbopack (chunks con hash, HMR, RSC)
  if (event.request.url.includes('_next/')) return
  if (event.request.url.includes('__nextjs')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached ?? fetch(event.request)
    })
  )
})
