import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Config Vitest pour les tests unitaires + composants React.
 *
 * - `environment: 'happy-dom'` : fournit window/document/localStorage pour les
 *   composants client. Préféré à jsdom : plus rapide, supporte mieux les
 *   APIs récentes (storage, matchMedia natif), pas de bug version avec
 *   vitest@1.x (jsdom@25 vs jsdom@20 hoisting conflict).
 * - `setupFiles` : étend `expect` avec les matchers @testing-library/jest-dom
 *   (toBeInTheDocument, toHaveClass, etc.) et resète localStorage entre
 *   chaque test pour éviter les fuites d'état.
 * - `globals: true` : autorise `describe/it/expect` sans import explicite
 *   (cohérent avec le style Jest des autres apps du monorepo).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
