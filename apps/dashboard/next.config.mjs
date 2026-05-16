import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sportlocker/types'],
  experimental: { typedRoutes: true },
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
  disableLogger: true,
})
