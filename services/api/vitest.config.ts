import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests d'intégration : on partage les conteneurs entre fichiers
    // en gardant un seul fork (les containers sont coûteux à démarrer).
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 120_000, // démarrage des containers Postgres+Redis
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/routes/reservations.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
      reporter: ['text', 'html'],
    },
  },
})
