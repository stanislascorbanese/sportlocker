// `withSentryConfig` est importé de la racine, pas de '@sentry/nextjs/config'.
//
// Le sous-chemin './config' n'existe pas dans @sentry/nextjs 10.63, la version
// du lockfile : Node refusait le module et `next build` s'arrêtait avant même
// d'avoir lu cette config (ERR_PACKAGE_PATH_NOT_EXPORTED). Il a été ajouté vers
// 10.7x — et sur ces versions-là, c'est l'import racine qui est marqué déprécié,
// « stop working in v11 ».
//
// Les deux formes ne sont donc jamais valides sur la même version. On garde la
// racine tant qu'on est sur 10.63, et on repassera à './config' dans le même
// mouvement que la montée de version — pas avant, sinon le build recasse.
import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Headers PWA-ready : manifest + service worker servis avec les bons MIME
  // et cache courts pour permettre les màj des assets.
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Cache long des assets images statiques (icônes, splash, logos) servis
        // depuis /public — ils sont stables (versionnés par nom si besoin, ex.
        // icon-v2). Corrige le finding Lighthouse « durées de mise en cache ».
        // (Les assets /_next/static hashés sont déjà cachés 1 an par Next.)
        source: '/(.*)\\.(png|jpg|jpeg|svg|webp|gif|ico|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
    ]
  },
}

// Sentry wrapper — actif uniquement si NEXT_PUBLIC_SENTRY_DSN est set au
// runtime. `withSentryConfig` peut aussi uploader les source maps au build
// si SENTRY_AUTH_TOKEN est posé (stack traces déminifiées dans Sentry).
// Sans token, build OK mais stack traces minifiées.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silent en CI/build, verbose en dev local.
  silent: !process.env.CI,
  // Source maps stockées côté Sentry mais cachées au client final.
  hideSourceMaps: true,
  // Upload ignoré silencieusement s'il n'y a pas de token.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Retire les logs de debug du SDK du bundle de production.
  // Remplace `disableLogger`, déprécié.
  webpack: { treeshake: { removeDebugLogging: true } },
})
