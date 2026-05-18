import { defineConfig } from 'astro/config'
import tailwind from '@astrojs/tailwind'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://sportlocker.fr',
  trailingSlash: 'never',
  integrations: [tailwind({ applyBaseStyles: false }), react()],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      assetsInlineLimit: 4096,
    },
  },
})
