import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sportlocker/types'],
  experimental: { typedRoutes: true },
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
  // Upload skip silencieusement si pas de token.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disableLogger: true,
})
