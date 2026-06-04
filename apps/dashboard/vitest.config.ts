import { defineConfig } from 'vitest/config'

/**
 * Configuration vitest pour le dashboard.
 *
 * On utilise `happy-dom` plutôt que `jsdom` :
 *  - 2-5× plus rapide au boot (important quand on a beaucoup de specs).
 *  - Couvre largement notre besoin (atomes UI, rendu Tailwind, events).
 *  - Pas de getComputedStyle réaliste, mais on n'en a pas besoin ici
 *    (les tests vérifient les classes, pas les couleurs résolues).
 *
 * Le setup file installe @testing-library/jest-dom pour les matchers
 * (`toBeInTheDocument`, `toHaveClass`, etc.).
 *
 * `esbuild.jsx: 'automatic'` → JSX transform new-style (Next.js 15 default).
 * Sans ça, les fichiers `.test.tsx` qui n'importent pas React explicitement
 * échouent en `React is not defined` au runtime.
 */
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    css: false,
  },
})
