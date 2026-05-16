/**
 * Sentry edge runtime init (middleware + routes Edge si on en a).
 *
 * Le dashboard n'utilise pas l'edge runtime activement aujourd'hui, mais
 * Next.js exige ce fichier quand on configure Sentry via instrumentation.ts.
 *
 * No-op si NEXT_PUBLIC_SENTRY_DSN absent.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    debug: false,
  })
}
