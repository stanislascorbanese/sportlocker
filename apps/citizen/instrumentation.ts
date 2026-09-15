import * as Sentry from '@sentry/nextjs'

/**
 * Hook d'instrumentation Next.js — exécuté une fois au démarrage du serveur,
 * avant la première requête. C'est là que Sentry s'initialise côté serveur et
 * edge ; le navigateur est couvert par `instrumentation-client.ts`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

/**
 * Sans ce hook, les erreurs levées dans un Server Component imbriqué ne
 * remontent nulle part. Or c'est précisément là que vivent les appels à l'API :
 * une borne qui ne répond plus doit se voir.
 */
export const onRequestError = Sentry.captureRequestError
