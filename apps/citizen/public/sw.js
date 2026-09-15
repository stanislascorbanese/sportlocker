/* Service worker de désinstallation.
 *
 * L'ancienne app installait un service worker qui mettait en cache un shell
 * applicatif (carte, profil, historique) qui n'existe plus. Un navigateur qui
 * l'a encore continuerait à servir cette version morte indéfiniment : un 404
 * sur ce fichier ne suffit pas à l'en débarrasser.
 *
 * Ce fichier se désinscrit donc lui-même, vide les caches et recharge les
 * onglets ouverts. Il pourra être supprimé une fois la saison 2027 passée.
 */
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const client of clients) client.navigate(client.url)
    })(),
  )
})
