/**
 * Sentry client-side init (browser, exécuté dans chaque Client Component).
 *
 * Le DSN est exposé via NEXT_PUBLIC_* — il est conçu pour ça : c'est un
 * identifiant write-only, il ne permet pas de lire des erreurs côté Sentry.
 *
 * No-op si NEXT_PUBLIC_SENTRY_DSN absent.
 */
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Trace les navigations + interactions (10% sample).
    tracesSampleRate: 0.1,
    // Session Replay — désactivé pour MVP (consomme quota). À activer si
    // tu veux voir le replay vidéo des sessions où une erreur survient.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    debug: false,
  })
}
