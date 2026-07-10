import Fastify, { type FastifyError } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import sensible from '@fastify/sensible'
import websocket from '@fastify/websocket'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'

import { env } from './config/env.js'
import { Sentry } from './sentry.js'
import { makeCorsOriginHandler, parseCorsAllowedOrigins } from './lib/cors.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { authPlugin } from './plugins/auth.js'
import { mqttSubscriberPlugin } from './plugins/mqtt-subscriber.js'
import { shouldAllowList, shouldEnableRateLimit } from './plugins/rate-limit.js'

import { healthRoutes } from './routes/health.js'
import { distributorRoutes } from './routes/distributors.js'
import { reservationRoutes } from './routes/reservations.js'
import { userRoutes } from './routes/users.js'
import { walletRoutes } from './routes/wallet.js'
import { adminReservationRoutes } from './routes/admin-reservations.js'
import { adminMaintenanceRoutes } from './routes/admin-maintenance.js'
import { adminDistributorHealthRoutes } from './routes/admin-distributor-health.js'
import { adminStatsRoutes } from './routes/admin-stats.js'
import { adminCommuneRoutes } from './routes/admin-communes.js'
import { adminUserRoutes } from './routes/admin-users.js'
import { authRoutes } from './routes/auth.js'
import { adminAuthRoutes } from './routes/admin-auth.js'
import { adminInviteRoutes } from './routes/admin-invites.js'
import { adminAuditRoutes } from './routes/admin-audit.js'
import { itemTypeRoutes } from './routes/item-types.js'
import { adminItemTypeRoutes } from './routes/admin-item-types.js'
import { adminItemRoutes } from './routes/admin-items.js'
import { adminPricingRuleRoutes } from './routes/admin-pricing-rules.js'
import { adminPaymentRoutes } from './routes/admin-payments.js'
import { adminStripeConnectRoutes } from './routes/admin-stripe-connect.js'
import { pushSubscriptionRoutes } from './routes/push-subscriptions.js'
import { stripeWebhookRoutes } from './routes/stripe-webhook.js'
import { webhooksStripeRoutes } from './routes/webhooks-stripe.js'
import { adminLiveRoutes } from './routes/admin-live.js'
import { devRoutes } from './routes/dev.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    origin: makeCorsOriginHandler(parseCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS)),
    credentials: true,
  })

  // Rate-limit global — défense en profondeur contre scan/brute-force public.
  //
  // Politique :
  //   - 100 req/min/IP par défaut. Couvre largement la navigation citizen +
  //     dashboard ops en usage humain.
  //   - Skip côté Stripe webhook (signature vérifiée + IPs Stripe), health
  //     (probes Railway), Swagger (interne dev).
  //   - PAS de skip sur header Authorization brut (non validé à ce stade) : les
  //     utilisateurs authentifiés restent couverts par la limite globale
  //     généreuse (100/min/IP). Whitelister sur le header court-circuiterait
  //     aussi les limites strictes par route ci-dessous (faille corrigée).
  //   - Les routes /v1/auth/signin-link, /v1/auth/password-reset et
  //     /v1/auth/register définissent leur propre limite plus stricte
  //     (5/min/IP) via `config: { rateLimit: { max: 5 } }` côté route.
  //
  // La logique d'activation et l'allowList sont extraites dans plugins/rate-limit.ts
  // pour être testables sans monter toute l'app Fastify (qui dépend Postgres + Redis).
  if (shouldEnableRateLimit({ rateLimitEnabled: env.RATE_LIMIT_ENABLED, nodeEnv: env.NODE_ENV })) {
    await app.register(rateLimit, {
      global: true,
      max: 100,
      timeWindow: '1 minute',
      // Headers RFC draft — informe le client de son quota restant.
      addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true },
      addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'x-ratelimit-reset': true, 'retry-after': true },
      allowList: shouldAllowList,
      errorResponseBuilder: (_req, context) => ({
        error: 'rate_limit_exceeded',
        message: `Trop de requêtes. Réessayez dans ${Math.ceil(context.ttl / 1000)} s.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      }),
    })
  }

  await app.register(sensible)

  await app.register(swaggerPlugin)
  await app.register(authPlugin)
  await app.register(mqttSubscriberPlugin)
  // WebSocket temps réel dashboard — doit être enregistré avant les routes qui
  // utilisent `{ websocket: true }` (cf. adminLiveRoutes). maxPayload borne les
  // frames entrants : ce flux est unidirectionnel (serveur → client), aucun
  // message client volumineux légitime.
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } })

  // Hook Sentry sur Fastify : capture les erreurs non gérées + les requêtes
  // pour le tracing perf. No-op si SENTRY_DSN absent (cf. sentry.ts).
  if (env.SENTRY_DSN) {
    Sentry.setupFastifyErrorHandler(app)
  }

  // ⚠️ L'error handler DOIT être posé AVANT toute `app.register(<route>)`.
  // En Fastify, chaque `register` crée un contexte encapsulé qui capture
  // l'error handler du parent au moment de son boot (ici immédiat car on
  // `await` chaque register). Un `setErrorHandler` posé APRÈS les routes
  // n'est donc PAS hérité par ces contextes → les 5xx repartiraient avec la
  // sérialisation Fastify par défaut `{statusCode, code, message}` et
  // fuiteraient le message brut (driver/SQL) au client. Cf. fix #325 rendu
  // inopérant par cet ordre, re-corrigé ici.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    app.log.error({ err }, 'unhandled error')
    if (err.validation) return reply.status(400).send({ error: 'validation_error', details: err.validation })
    // 5xx → Sentry. 4xx → on log mais on n'inonde pas la télémétrie.
    const status = err.statusCode ?? 500
    if (status >= 500 && env.SENTRY_DSN) {
      Sentry.captureException(err, { extra: { url: req.url, method: req.method } })
    }
    // 5xx → message générique : ne pas fuiter de détails internes au client
    // (une erreur SQL/driver/Postgres non gérée peut contenir des noms de
    // colonnes, des fragments de requête, voire des indices d'infra). Le détail
    // reste loggé ci-dessus + envoyé à Sentry. 4xx → on conserve err.message
    // (erreurs métier/validation utiles et non sensibles, ex. "reservation_not_found").
    const body = status >= 500 ? 'internal_error' : err.message || 'internal_error'
    return reply.status(status).send({ error: body })
  })

  await app.register(healthRoutes,       { prefix: '/health' })
  await app.register(authRoutes,         { prefix: '/v1/auth' })
  await app.register(itemTypeRoutes,     { prefix: '/v1/item-types' })
  await app.register(distributorRoutes,  { prefix: '/v1/distributors' })
  await app.register(reservationRoutes,  { prefix: '/v1/reservations' })
  await app.register(userRoutes,         { prefix: '/v1/users' })
  await app.register(walletRoutes,       { prefix: '/v1/wallet' })
  await app.register(stripeWebhookRoutes, { prefix: '/v1/stripe' })
  await app.register(pushSubscriptionRoutes, { prefix: '/v1/push-subscriptions' })
  await app.register(adminAuthRoutes,         { prefix: '/v1/admin/auth' })
  await app.register(adminInviteRoutes,       { prefix: '/v1/admin/invites' })
  await app.register(adminReservationRoutes,  { prefix: '/v1/admin/reservations' })
  await app.register(adminMaintenanceRoutes,  { prefix: '/v1/admin/maintenance-tickets' })
  await app.register(adminDistributorHealthRoutes, { prefix: '/v1/admin/distributors' })
  await app.register(adminStatsRoutes,        { prefix: '/v1/admin/stats' })
  await app.register(adminCommuneRoutes,      { prefix: '/v1/admin/communes' })
  await app.register(adminUserRoutes,         { prefix: '/v1/admin/users' })
  await app.register(adminAuditRoutes,        { prefix: '/v1/admin/audit' })
  await app.register(adminItemTypeRoutes,     { prefix: '/v1/admin/item-types' })
  await app.register(adminItemRoutes,         { prefix: '/v1/admin/items' })
  await app.register(adminPricingRuleRoutes,  { prefix: '/v1/admin/pricing-rules' })
  await app.register(adminPaymentRoutes,      { prefix: '/v1/admin/payments' })
  await app.register(adminStripeConnectRoutes, { prefix: '/v1/admin/stripe-connect' })
  await app.register(adminLiveRoutes,         { prefix: '/v1/admin/live' })
  await app.register(webhooksStripeRoutes,    { prefix: '/v1/webhooks' })

  // Routes de dev/simulation — register UNIQUEMENT hors production.
  // La route refuse aussi en interne si NODE_ENV=production (defense-in-depth),
  // mais on évite déjà de les mounter pour ne pas exposer le path Swagger.
  if (env.NODE_ENV !== 'production') {
    await app.register(devRoutes, { prefix: '/v1/dev' })
  }

  return app
}
