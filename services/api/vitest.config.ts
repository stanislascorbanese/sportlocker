import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests d'intégration : un seul worker à la fois → un seul conteneur
    // testcontainers vivant simultanément (coûteux à démarrer). Vitest 4 a
    // retiré poolOptions.forks.singleFork au profit de maxWorkers (cf. pool rework).
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 120_000, // démarrage des containers Postgres+Redis
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/routes/**/*.ts'],
      thresholds: {
        perFile: true,
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      reporter: ['text', 'html'],
    },
  },
})
