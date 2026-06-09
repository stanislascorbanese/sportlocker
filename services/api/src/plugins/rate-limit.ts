/**
 * Configuration du rate-limit global de l'API.
 *
 * Ce fichier n'est qu'un helper de configuration — le `await app.register()`
 * proprement dit reste dans `app.ts` pour ne pas casser l'ordre de boot.
 *
 * Le but : exposer `shouldAllowList()` comme fonction pure et testable,
 * sans avoir à monter toute l'application Fastify (qui pull Postgres,
 * Redis, MQTT, etc.).
 *
 * Cf. `app.ts` pour le contexte d'usage.
 */
import type { FastifyRequest } from 'fastify'

/**
 * Détermine si une requête doit être whitelist (= skip du rate-limit).
 *
 * Politique :
 *   - Skip les probes infra (`/health`, `/docs`, `/swagger`).
 *   - Skip les webhooks signés (`/v1/stripe/webhook`, `/v1/webhooks/*`) — la
 *     signature Stripe + l'IP whitelist Stripe couvrent déjà l'abuse.
 *   - Skip toute requête avec un header `Authorization: Bearer ...` — on
 *     fait confiance aux utilisateurs authentifiés. Le JWT est validé en
 *     `preHandler` ailleurs ; ici on veut juste éviter de bloquer un
 *     opérateur ou un admin légitime.
 *
 * Tout le reste (signin-link, password-reset, distributors/nearby, etc.)
 * est soumis au rate-limit global.
 */
export function shouldAllowList(req: Pick<FastifyRequest, 'url' | 'headers'>): boolean {
  if (req.url.startsWith('/health')) return true
  if (req.url.startsWith('/docs') || req.url.startsWith('/swagger')) return true
  if (req.url.startsWith('/v1/stripe/webhook')) return true
  if (req.url.startsWith('/v1/webhooks/')) return true

  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return true

  return false
}

/**
 * Détermine si le rate-limit doit être activé au boot.
 *
 * Par défaut actif sauf `NODE_ENV=test` (mirror de la logique
 * MQTT_SUBSCRIBER_ENABLED — les tests d'intégration spamment plusieurs
 * centaines de requêtes en quelques secondes et n'ont pas besoin du gate).
 */
export function shouldEnableRateLimit(opts: {
  rateLimitEnabled: boolean | undefined
  nodeEnv: 'development' | 'test' | 'production'
}): boolean {
  if (opts.rateLimitEnabled !== undefined) return opts.rateLimitEnabled
  return opts.nodeEnv !== 'test'
}
