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
  transpilePackages: ['@sportlocker/types'],
  // `typedRoutes` est sorti d'`experimental` en 15.5 ; l'y laisser déclenche un
  // avertissement au build et finira par ne plus être lu du tout.
  typedRoutes: true,
  experimental: {
    // L'import des séjours fait traverser le CSV par une server action, et Next
    // plafonne leur corps à 1 Mo par défaut. L'API en accepte 4 : sans ce
    // réglage, un gros export serait refusé ici, avant même d'arriver à l'API.
    serverActions: { bodySizeLimit: '5mb' },
  },
  // packages/types utilise la convention ESM TS (`./locker.js` qui pointe en
  // réalité vers `./locker.ts`). tsc le résout via `moduleResolution: Bundler`,
  // webpack a besoin d'un coup de pouce explicite — sinon "Can't resolve
  // './locker.js'" au `next build`.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

// Sentry wrapper — actif uniquement si NEXT_PUBLIC_SENTRY_DSN est set au
// runtime. `withSentryConfig` peut aussi uploader les source maps au build
// si SENTRY_AUTH_TOKEN est posé (pour avoir des stack traces déminifiées
// dans Sentry). Sans token, build OK mais stack traces minifiées.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Silent en CI/build, verbose en dev local.
  silent: !process.env.CI,
  // Source maps stockées côté Sentry mais cachées au client final.
  hideSourceMaps: true,
  // Upload skip silencieusement si pas de token.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Retire les logs de debug du SDK du bundle de production.
  // Remplace `disableLogger`, déprécié.
  webpack: { treeshake: { removeDebugLogging: true } },
})
