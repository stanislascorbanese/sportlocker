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

export default nextConfig
