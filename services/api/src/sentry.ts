/**
 * Sentry init pour @sportlocker/api.
 *
 * IMPORTANT — ce fichier doit être importé EN PREMIER dans index.ts,
 * avant Fastify et toute autre lib instrumentée. Sinon Sentry ne peut
 * pas patcher les modules à temps (auto-instrumentation http/postgres).
 *
 * Si SENTRY_DSN est absent (dev local, tests, premier déploiement),
 * Sentry.init() est skip → SDK no-op, aucune télémétrie envoyée.
 */
import * as Sentry from '@sentry/node'

import { env } from './config/env.js'

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    // Volontaire : pas de console.log ici, ça pollue les tests et la dev.
    return
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Échantillonnage perf — 10% par défaut, configurable via env.
    // Mettre à 1.0 = trace toutes les requêtes (coûteux en quota).
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Auto-instrumentation Node : capture http, postgres-js, ioredis,
    // etc. Sans config supplémentaire.
    integrations: [Sentry.httpIntegration(), Sentry.consoleIntegration()],
    // Ne pas spammer Sentry avec les erreurs de validation 4xx qu'on
    // gère déjà côté Zod : les filtrer côté Fastify errorHandler avant
    // capture (cf. app.ts).
  })
}

export { Sentry }
