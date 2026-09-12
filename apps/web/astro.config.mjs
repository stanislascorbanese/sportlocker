import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'

// Pages exclues du sitemap : pages légales/utilitaires à faible valeur SEO.
// On les laisse indexables (pas de noindex) mais hors sitemap, comme le faisait
// l'ancien sitemap.xml manuel — qui dérivait à chaque ajout de page.
//
// `/contact` N'EN EST PLUS. Le commentaire qui justifiait son exclusion disait
// qu'elle était en `noindex` ; elle ne l'est plus — `Base.astro` n'émet la
// balise que si la page la demande, et `/contact` passe `noindex={false}`. Une
// page de conversion indexable et absente du sitemap, c'est le signal
// contradictoire inverse de celui qu'on voulait éviter.
const SITEMAP_EXCLUDE = [
  '/cgu', '/cgv', '/mentions-legales', '/confidentialite',
  // Anciennes adresses, désormais redirigées en 301 par `public/serve.json`.
  // Elles restent listées ici par sécurité : si une page-relais réapparaissait,
  // elle n'entrerait pas au sitemap pour autant.
  '/mairies', '/couverture', '/communes', '/faq', '/campings',
]

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
