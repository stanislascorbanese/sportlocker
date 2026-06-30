/**
 * Next.js instrumentation hook — appelé une fois au boot du serveur,
 * AVANT que toute requête soit traitée. C'est l'endroit recommandé par
 * Next 13+ pour init Sentry côté serveur/edge.
 *
 * Le client (browser) est init séparément par Next via sentry.client.config.ts
 * (Next auto-charge ce fichier dans le bundle client).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
