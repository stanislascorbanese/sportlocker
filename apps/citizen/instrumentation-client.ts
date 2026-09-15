/**
 * Sentry côté navigateur.
 *
 * Ce fichier s'appelait `sentry.client.config.ts` ; Next 15 attend désormais
 * `instrumentation-client.ts`, et l'ancien nom cesse de fonctionner sous
 * Turbopack.
 *
 * Le DSN passe par NEXT_PUBLIC_* et c'est voulu : c'est un identifiant en
 * écriture seule, il ne donne pas accès aux erreurs déjà remontées.
 *
 * Sans DSN, tout ce fichier est inerte — un déploiement sans Sentry marche.
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

/**
 * Remonte les navigations à Sentry. Sans ce hook, une erreur survenue après un
 * changement de page est rattachée à la page d'arrivée, pas à celle où elle
 * s'est produite — et on cherche longtemps.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
