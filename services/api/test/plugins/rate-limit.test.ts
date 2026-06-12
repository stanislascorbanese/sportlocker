/**
 * Tests unitaires des helpers du rate-limit.
 *
 * On teste séparément `shouldAllowList` (politique de skip par URL/auth) et
 * `shouldEnableRateLimit` (activation au boot). Le plugin Fastify lui-même
 * n'est pas monté ici — sa registration est validée par les tests
 * d'intégration end-to-end (auth.test.ts qui doit toujours passer même
 * avec rate-limit activé pour les routes non-strictement-limitées).
 *
 * Le but : garantir que l'API ne se bloque JAMAIS elle-même pour des
 * requêtes légitimes (probes infra, webhooks Stripe, utilisateurs auth) et
 * qu'elle bloque effectivement le trafic public anonyme.
 */
import { describe, expect, it } from 'vitest'

import { shouldAllowList, shouldEnableRateLimit } from '../../src/plugins/rate-limit.js'

function makeReq(url: string, authHeader?: string) {
  return {
    url,
    headers: authHeader ? { authorization: authHeader } : {},
  }
}

describe('shouldAllowList', () => {
  describe('skips trusted infra paths', () => {
    it('whiteliste /health', () => {
      expect(shouldAllowList(makeReq('/health/'))).toBe(true)
      expect(shouldAllowList(makeReq('/health/ready'))).toBe(true)
    })
    it('whiteliste /docs et /swagger', () => {
      expect(shouldAllowList(makeReq('/docs'))).toBe(true)
      expect(shouldAllowList(makeReq('/docs/json'))).toBe(true)
      expect(shouldAllowList(makeReq('/swagger'))).toBe(true)
    })
    it('whiteliste les webhooks Stripe (signature vérifiée + IPs whitelistées par Stripe)', () => {
      expect(shouldAllowList(makeReq('/v1/stripe/webhook'))).toBe(true)
      expect(shouldAllowList(makeReq('/v1/webhooks/stripe-connect'))).toBe(true)
    })
  })

  describe('ne whiteliste PAS sur un header Authorization non vérifié', () => {
    // Le header n'est pas validé à ce stade (la vérif JWT a lieu en preHandler) :
    // n'importe quel client peut attacher "Bearer x". Whitelister dessus
    // court-circuiterait le rate-limit global ET les limites strictes par route.
    it('ne whiteliste PAS un Bearer arbitraire', () => {
      expect(shouldAllowList(makeReq('/v1/reservations', 'Bearer eyJ...'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/admin/users', 'Bearer abc123'))).toBe(false)
    })
    it('ne whiteliste PAS un header Authorization Basic', () => {
      expect(shouldAllowList(makeReq('/v1/reservations', 'Basic xxx'))).toBe(false)
    })
    it('ne whiteliste PAS "Bearer " sans token', () => {
      expect(shouldAllowList(makeReq('/v1/reservations', 'Bearer '))).toBe(false)
    })
    it('régression sécu : un Bearer bidon ne contourne PAS la limite stricte des routes /v1/auth/*', () => {
      expect(shouldAllowList(makeReq('/v1/auth/password-reset', 'Bearer x'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/auth/signin-link', 'Bearer eyJfake'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/auth/register', 'Bearer abc'))).toBe(false)
    })
  })

  describe('does NOT skip public unauthenticated traffic', () => {
    it('rate-limite les routes /v1/auth/* anonymes', () => {
      expect(shouldAllowList(makeReq('/v1/auth/signin-link'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/auth/password-reset'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/auth/register'))).toBe(false)
    })
    it('rate-limite les routes publiques scrapables (distributors/nearby, item-types)', () => {
      expect(shouldAllowList(makeReq('/v1/distributors/nearby?lat=48&lng=2'))).toBe(false)
      expect(shouldAllowList(makeReq('/v1/item-types'))).toBe(false)
    })
    it('rate-limite une requête anonyme arbitraire', () => {
      expect(shouldAllowList(makeReq('/v1/anything'))).toBe(false)
      expect(shouldAllowList(makeReq('/'))).toBe(false)
    })
  })
})

describe('shouldEnableRateLimit', () => {
  it("est désactivé par défaut en environnement test", () => {
    expect(shouldEnableRateLimit({ rateLimitEnabled: undefined, nodeEnv: 'test' })).toBe(false)
  })

  it('est activé par défaut en development', () => {
    expect(shouldEnableRateLimit({ rateLimitEnabled: undefined, nodeEnv: 'development' })).toBe(true)
  })

  it('est activé par défaut en production', () => {
    expect(shouldEnableRateLimit({ rateLimitEnabled: undefined, nodeEnv: 'production' })).toBe(true)
  })

  it("respecte l'override explicite RATE_LIMIT_ENABLED=true même en test", () => {
    expect(shouldEnableRateLimit({ rateLimitEnabled: true, nodeEnv: 'test' })).toBe(true)
  })

  it("respecte l'override explicite RATE_LIMIT_ENABLED=false même en production", () => {
    // Cas d'urgence : si le rate-limit bloque un client légitime en prod, on doit
    // pouvoir le couper à chaud via env var sans rebuild de l'image Docker.
    expect(shouldEnableRateLimit({ rateLimitEnabled: false, nodeEnv: 'production' })).toBe(false)
  })
})
