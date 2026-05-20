/**
 * Helpers CORS — whitelist explicite des origines autorisées.
 *
 * Pourquoi un helper isolé :
 *   1. **Testabilité** — buildApp() require Postgres + Redis (testcontainers).
 *      Extraire la logique en fonctions pures permet de la tester sans Docker.
 *   2. **Doctrine sécu** — remplace `origin: true` (qui réfléchit n'importe
 *      quelle Origin à l'envoyeur, donc CORS effectivement désactivé) par une
 *      whitelist explicite. Voir docs/SECURITY.md §9 item #4.
 *   3. **Compat native mobile** — les requêtes natives (RN, curl, serveur)
 *      n'envoient pas de header `Origin`. On les laisse passer (le filtrage
 *      par origin ne s'applique qu'aux navigateurs).
 */

/**
 * Parse la string CORS_ALLOWED_ORIGINS (CSV) en liste d'origines exactes.
 * Trim chaque entrée, ignore les vides.
 *
 * Exemple : `"http://localhost:3001, https://app.sportlocker.fr"`
 *        → `['http://localhost:3001', 'https://app.sportlocker.fr']`
 */
export function parseCorsAllowedOrigins(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Construit le handler `origin` attendu par @fastify/cors.
 *
 * Règles :
 *   - Pas de header `Origin` (requête native, serveur, curl) → autorisé.
 *     Les navigateurs envoient toujours `Origin` sur les requêtes cross-origin,
 *     donc l'absence du header signifie que la protection CORS ne s'applique
 *     pas à cette requête (cas mobile native ou same-origin).
 *   - Origin présent et listé dans la whitelist (match exact) → autorisé.
 *   - Origin présent et pas listé → refusé via callback d'erreur.
 *     @fastify/cors traduit ça en réponse sans header Access-Control-*,
 *     ce qui fait échouer la preflight côté navigateur.
 */
export function makeCorsOriginHandler(
  allowedOrigins: readonly string[],
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  const allowed = new Set(allowedOrigins)
  return (origin, cb) => {
    if (!origin) return cb(null, true)
    if (allowed.has(origin)) return cb(null, true)
    cb(new Error(`Origin "${origin}" not allowed by CORS`), false)
  }
}

/**
 * Vérifie qu'une whitelist d'origines est utilisable en production.
 * Retourne la liste des raisons d'invalidité (vide si tout va bien).
 *
 * Cible : appelé au boot quand NODE_ENV=production. Si la liste est vide ou
 * ne contient que des loopback, la prod est mal configurée — on préfère un
 * crash bruyant au boot plutôt qu'une faille silencieuse.
 */
export function validateProductionAllowedOrigins(origins: readonly string[]): string[] {
  const reasons: string[] = []
  if (origins.length === 0) {
    reasons.push('whitelist vide')
    return reasons
  }
  const loopbackHosts = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]']
  const allLoopback = origins.every((o) => loopbackHosts.some((h) => o.includes(h)))
  if (allLoopback) {
    reasons.push('ne contient que des origines loopback')
  }
  return reasons
}
