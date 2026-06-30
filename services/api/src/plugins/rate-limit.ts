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
 *
 * IMPORTANT — on NE whiteliste PAS sur la simple présence d'un header
 * `Authorization: Bearer ...`. Ce header n'est pas validé à ce stade (la vérif
 * JWT a lieu plus tard en `preHandler`), donc n'importe quel client peut
 * l'attacher. Whitelister dessus court-circuiterait le rate-limit global ET les
 * limites strictes par route (`config.rateLimit`), rendant inopérante la
 * protection des routes publiques `/v1/auth/*` (énumération d'e-mails, spam de
 * magic-links, épuisement du quota Firebase `verifyIdToken`). Les utilisateurs
 * authentifiés légitimes restent couverts par la limite globale généreuse
 * (100/min/IP), très au-dessus d'un usage humain.
 *
 * Tout le reste (signin-link, password-reset, distributors/nearby, etc.)
 * est soumis au rate-limit.
 */
export function shouldAllowList(req: Pick<FastifyRequest, 'url' | 'headers'>): boolean {
  if (req.url.startsWith('/health')) return true
  if (req.url.startsWith('/docs') || req.url.startsWith('/swagger')) return true
  if (req.url.startsWith('/v1/stripe/webhook')) return true
  if (req.url.startsWith('/v1/webhooks/')) return true

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
