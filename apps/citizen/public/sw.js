/* eslint-disable */
/**
 * Service Worker minimal pour SportLocker citoyen.
 *
 * Stratégie cache : "network-first avec fallback cache" pour les assets
 * statiques uniquement (HTML/JS/CSS/images). Les appels API (/v1/*)
 * passent toujours en network direct — pas de cache pour éviter de
 * servir des données stales (distributeurs idle, réservations actives).
 *
 * MVP : pas d'offline complet, juste "redémarre l'app sans réseau".
 * À évoluer : Background Sync pour les réservations en zone blanche.
 */

// v2 : bump du cache pour purger les anciens assets bleus (logos PWA pré-recolorisation verte).
// Le handler `activate` ci-dessous supprime tous les caches dont le nom diffère de CACHE_NAME,
// donc bumper le suffixe = wipe complet de l'ancien cache au prochain reload.
const CACHE_NAME = 'sportlocker-v2'
const PRECACHE = ['/', '/login', '/map', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Bypass complet pour les API et tile servers — toujours network direct.
  if (
    url.pathname.startsWith('/v1/') ||
    url.host.endsWith('googleapis.com') ||
    url.host.endsWith('firebaseapp.com') ||
    url.host.endsWith('openfreemap.org') ||
    url.host.endsWith('data.gouv.fr')
  ) {
    return
  }

  // Network-first pour le reste, fallback cache.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.status === 200 && event.request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error())),
  )
})
