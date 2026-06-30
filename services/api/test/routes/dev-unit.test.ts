/**
 * Tests légers (sans testcontainers) des parties de `dev.ts` non couvertes par
 * l'E2E de dev.test.ts :
 *
 *   1. Le **gate production** (`NODE_ENV === 'production'`) — defense-in-depth
 *      qui répond 403 même si le plugin était register par erreur en prod.
 *      Inaccessible depuis l'app de test classique (NODE_ENV=test).
 *   2. Le helper **`decodeJti`** — ses branches défensives (token mal formé,
 *      payload non-JSON, jti absent/non-string) ne sont jamais atteintes par
 *      l'endpoint, qui ne lui passe que des tokens fraîchement signés.
 *
 * On pose un env "prod plausible" (URLs publiques + CORS valides, sinon le
 * boot prod de env.ts `process.exit(1)`) AVANT d'importer dynamiquement
 * `dev.ts`, et on restaure après (process.env est partagé entre fichiers d'un
 * même worker vitest).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { FastifyInstance } from 'fastify'

const PROD_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db',  // jamais connecté
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_SESSION_SECRET: 'a'.repeat(64),
  JWT_DEVICE_SECRET: 'b'.repeat(64),
  // env.ts refuse de booter en prod si ces URLs sont loopback / CORS vide.
  DASHBOARD_INVITE_BASE_URL: 'https://ops.sportlocker.fr',
  CITIZEN_APP_BASE_URL: 'https://app.sportlocker.fr',
  CORS_ALLOWED_ORIGINS: 'https://app.sportlocker.fr,https://ops.sportlocker.fr',
}
const ORIGINAL_ENV: Record<string, string | undefined> = {}

let devRoutes: (app: FastifyInstance) => Promise<void>
let decodeJti: (token: string) => string

beforeAll(async () => {
  for (const [k, v] of Object.entries(PROD_ENV)) {
    ORIGINAL_ENV[k] = process.env[k]
    process.env[k] = v
  }
  // Import APRÈS avoir posé l'env (env.ts parse à l'import, une seule fois).
  const mod = await import('../../src/routes/dev.js')
  devRoutes = mod.devRoutes as typeof devRoutes
  decodeJti = mod.decodeJti
})

afterAll(() => {
  for (const k of Object.keys(PROD_ENV)) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k]
    else process.env[k] = ORIGINAL_ENV[k]
  }
})

describe('devRoutes — gate production', () => {
  it('répond 403 forbidden_in_production quand NODE_ENV=production', async () => {
    const Fastify = (await import('fastify')).default
    const app = Fastify()
    await app.register(devRoutes, { prefix: '/v1/dev' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/dev/simulate-scan',
      payload: { reservationId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'forbidden_in_production' })

    await app.close()
  })
})

describe('decodeJti', () => {
  const b64u = (obj: unknown): string =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  it('extrait le jti d\'un JWT bien formé', () => {
    expect(decodeJti(`header.${b64u({ jti: 'nonce-123' })}.sig`)).toBe('nonce-123')
  })

  it('retourne "" si le token n\'a pas exactement 3 segments', () => {
    expect(decodeJti('a.b')).toBe('')
    expect(decodeJti('a.b.c.d')).toBe('')
  })

  it('retourne "" si le segment payload est vide', () => {
    expect(decodeJti('a..c')).toBe('')
  })

  it('retourne "" si le payload n\'est pas du JSON décodable (catch)', () => {
    expect(decodeJti('a.not-valid-json.c')).toBe('')
  })

  it('retourne "" si jti est absent ou non-string', () => {
    expect(decodeJti(`h.${b64u({ foo: 1 })}.s`)).toBe('')
    expect(decodeJti(`h.${b64u({ jti: 42 })}.s`)).toBe('')
  })
})
