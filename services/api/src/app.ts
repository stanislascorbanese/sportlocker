import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import sensible from '@fastify/sensible'
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod'

import { env } from './config/env.js'
import { Sentry } from './sentry.js'
import { swaggerPlugin } from './plugins/swagger.js'
import { authPlugin } from './plugins/auth.js'

import { healthRoutes } from './routes/health.js'
import { distributorRoutes } from './routes/distributors.js'
import { reservationRoutes } from './routes/reservations.js'
import { adminReservationRoutes } from './routes/admin-reservations.js'
import { adminMaintenanceRoutes } from './routes/admin-maintenance.js'
import { adminStatsRoutes } from './routes/admin-stats.js'
import { authRoutes } from './routes/auth.js'
import { itemTypeRoutes } from './routes/item-types.js'

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
  await app.register(cors, { origin: true, credentials: true })
  await app.register(sensible)

  await app.register(swaggerPlugin)
  await app.register(authPlugin)

  await app.register(healthRoutes,       { prefix: '/health' })
  await app.register(authRoutes,         { prefix: '/v1/auth' })
  await app.register(itemTypeRoutes,     { prefix: '/v1/item-types' })
  await app.register(distributorRoutes,  { prefix: '/v1/distributors' })
  await app.register(reservationRoutes,  { prefix: '/v1/reservations' })
  await app.register(adminReservationRoutes,  { prefix: '/v1/admin/reservations' })
  await app.register(adminMaintenanceRoutes,  { prefix: '/v1/admin/maintenance-tickets' })
  await app.register(adminStatsRoutes,        { prefix: '/v1/admin/stats' })

  // Hook Sentry sur Fastify : capture les erreurs non gérées + les requêtes
  // pour le tracing perf. No-op si SENTRY_DSN absent (cf. sentry.ts).
  if (env.SENTRY_DSN) {
    Sentry.setupFastifyErrorHandler(app)
  }

  app.setErrorHandler((err, req, reply) => {
    app.log.error({ err }, 'unhandled error')
    if (err.validation) return reply.status(400).send({ error: 'validation_error', details: err.validation })
    // 5xx → Sentry. 4xx → on log mais on n'inonde pas la télémétrie.
    const status = err.statusCode ?? 500
    if (status >= 500 && env.SENTRY_DSN) {
      Sentry.captureException(err, { extra: { url: req.url, method: req.method } })
    }
    return reply.status(status).send({ error: err.message || 'internal_error' })
  })

  return app
}
