import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'

// Pages exclues du sitemap : pages légales/utilitaires à faible valeur SEO.
// On les laisse indexables (pas de noindex) mais hors sitemap, comme le faisait
// l'ancien sitemap.xml manuel — qui dérivait à chaque ajout de page.
const SITEMAP_EXCLUDE = ['/cgu', '/cgv', '/mentions-legales', '/confidentialite']

export default defineConfig({
  site: 'https://sportlocker.fr',
  trailingSlash: 'never',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    react(),
    sitemap({
      filter: (page) =>
        !SITEMAP_EXCLUDE.some((path) => page === `https://sportlocker.fr${path}`),
    }),
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      assetsInlineLimit: 4096,
    },
  },
})
