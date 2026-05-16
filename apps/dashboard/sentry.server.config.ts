/**
 * Sentry server-side init (Server Components, Server Actions, API routes
 * Next.js et middleware Node runtime).
 *
 * No-op si NEXT_PUBLIC_SENTRY_DSN absent → safe deploy même sans config Sentry.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Échantillonnage perf — 10% par défaut. Bumper à 1.0 pour debug ponctuel.
    tracesSampleRate: 0.1,
    // Pas de logs verbose en prod
    debug: false,
  })
}
