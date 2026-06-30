/* eslint-disable */
/**
 * Service Worker SportLocker citoyen.
 *
 * Stratégie cache : "network-first avec fallback cache" pour les assets
 * statiques uniquement (HTML/JS/CSS/images). Les appels API (/v1/*)
 * passent toujours en network direct — pas de cache pour éviter de
 * servir des données stales (distributeurs idle, réservations actives).
 *
 * MVP : pas d'offline complet, juste "redémarre l'app sans réseau".
 * À évoluer : Background Sync pour les réservations en zone blanche.
 */

// v3 : bump du cache pour purger les anciens SW (avant que les action
// buttons + vibration soient ajoutés). Le handler `activate` ci-dessous
// supprime tous les caches dont le nom diffère de CACHE_NAME, donc bumper
// le suffixe = wipe complet de l'ancien cache au prochain reload.
const CACHE_NAME = 'sportlocker-v3'
const PRECACHE = ['/', '/login', '/manifest.json']

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

// ─── Web Push (PR 0010 + polish) ───────────────────────────────────────────
//
// Le backend signe + chiffre le payload via lib/webpush.ts. Ici on désérialise
// et on affiche. Format attendu (extensible côté backend) :
//   {
//     title: string                  // requis
//     body: string                   // requis
//     url?: string                   // URL au clic body (défaut '/')
//     icon?: string                  // override de /icon-192.png
//     tag?: string                   // dédup browser (ex. 'reservation-<id>')
//     renotify?: boolean             // re-fait sonner si tag déjà affiché
//     actions?: Array<{
//       action: string               // identifiant (clé pour notificationclick)
//       title: string                // label visible bouton
//       url?: string                 // URL spécifique à cette action
//       icon?: string                // icône à côté du label
//     }>
//   }
//
// Note Web Push API : 2 actions max sont garanties d'apparaître sur Android.
// Au-delà le browser les tronque sans erreur. Sur iOS Safari 16.4+, les
// actions ne sont pas encore affichées (juste le body click) — on dégrade
// silencieusement.

const DEFAULT_VIBRATE = [180, 80, 180] // tap-pause-tap, ressenti "ding" court

self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload
  try {
    payload = event.data.json()
  } catch (_e) {
    payload = { title: 'SportLocker', body: event.data.text() }
  }

  const title = payload.title || 'SportLocker'
  const actions = Array.isArray(payload.actions)
    ? payload.actions.slice(0, 2).map((a) => ({
        action: String(a.action || ''),
        title: String(a.title || ''),
        ...(a.icon ? { icon: String(a.icon) } : {}),
      }))
    : undefined

  // On stocke les URLs par-action dans `data` pour les retrouver dans
  // notificationclick (l'objet `action` du DOM event ne porte que la clé,
  // pas l'URL).
  const actionUrls = {}
  if (Array.isArray(payload.actions)) {
    for (const a of payload.actions) {
      if (a.action && a.url) actionUrls[a.action] = a.url
    }
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,
    renotify: Boolean(payload.renotify),
    vibrate: DEFAULT_VIBRATE,
    data: {
      url: payload.url || '/',
      actionUrls,
    },
    ...(actions ? { actions } : {}),
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options)
      // App Badging API — montre un point sur l'icône PWA home screen
      // (iOS 16.4+, Chrome 81+ Android, Edge desktop). `setAppBadge(1)`
      // = pastille présence. On évite de tracker un compteur côté SW
      // (pas de IndexedDB ici) — c'est l'app qui clear au mount via
      // navigator.clearAppBadge().
      if ('setAppBadge' in self.navigator) {
        try {
          await self.navigator.setAppBadge(1)
        } catch (_e) {
          // Permission refusée ou API absente — silent.
        }
      }
    })(),
  )
})

// Au clic sur la notif (body OU action button) : focus une fenêtre existante
// ou ouvre l'URL. Resolve l'URL par action si dispo, sinon URL par défaut.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  // Sur clic sur une action button, event.action contient son identifiant
  // ('view', 'dismiss', etc.). Sur clic sur le body, event.action === ''.
  const actionKey = event.action
  let targetUrl = data.url || '/'
  if (actionKey && data.actionUrls && data.actionUrls[actionKey]) {
    targetUrl = data.actionUrls[actionKey]
  }

  // Action 'dismiss' explicite (si le backend l'envoie) : on close juste,
  // pas de navigation.
  if (actionKey === 'dismiss') {
    return
  }

  event.waitUntil(
    (async () => {
      // Clear le badge dès que l'utilisateur interagit — la notif est lue.
      if ('clearAppBadge' in self.navigator) {
        try {
          await self.navigator.clearAppBadge()
        } catch (_e) {
          // silent
        }
      }

      const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of wins) {
        if ('navigate' in client && 'focus' in client) {
          await client.focus()
          return client.navigate(targetUrl)
        }
      }
      return clients.openWindow(targetUrl)
    })(),
  )
})
