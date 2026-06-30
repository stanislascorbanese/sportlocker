/**
 * Tests unitaires de la vérification HMAC des events MQTT firmware.
 *
 * On vérifie surtout que `canonicalizeJson` produit *exactement* le même
 * output que ce que le firmware Python utilise pour signer
 * (`json.dumps(data, sort_keys=True, separators=(",", ":"))`). Sans cette
 * cohérence, le HMAC ne match jamais et toute Phase 4 E2E reste cassée.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.JWT_SESSION_SECRET = 'a'.repeat(64)
  process.env.JWT_DEVICE_SECRET = 'test-device-secret-32-chars-long-padding'
  process.env.DATABASE_URL = 'postgres://noop:noop@127.0.0.1:1/noop'
})

describe('canonicalizeJson', () => {
  it('serialise les clés dans l\'ordre alphabétique, sans espaces', async () => {
    const { canonicalizeJson } = await import('../../src/lib/mqtt-hmac.js')
    const out = canonicalizeJson({ b: 2, a: 1, c: 3 })
    expect(out).toBe('{"a":1,"b":2,"c":3}')
  })

  it('descend récursivement dans les objets imbriqués', async () => {
    const { canonicalizeJson } = await import('../../src/lib/mqtt-hmac.js')
    const out = canonicalizeJson({ outer: { z: 1, a: 2 }, key: 'val' })
    expect(out).toBe('{"key":"val","outer":{"a":2,"z":1}}')
  })

  it('matche le format Python json.dumps(sort_keys=True, separators=(",", ":"))', async () => {
    const { canonicalizeJson } = await import('../../src/lib/mqtt-hmac.js')
    // Cas réel : payload door_unlocked tel que produit par le firmware.
    const payload = {
      type: 'door_unlocked',
      deviceId: '00000000-0000-0000-0000-000000000000',
      reservationId: '11111111-1111-1111-1111-111111111111',
      lockerId: '22222222-2222-2222-2222-222222222222',
      jti: 'abc123',
      openedAt: 1715692800,
      mode: 'online',
    }
    // Output attendu (clés triées, pas d'espaces) — équivalent Python exact.
    const expected =
      '{"deviceId":"00000000-0000-0000-0000-000000000000",' +
      '"jti":"abc123",' +
      '"lockerId":"22222222-2222-2222-2222-222222222222",' +
      '"mode":"online",' +
      '"openedAt":1715692800,' +
      '"reservationId":"11111111-1111-1111-1111-111111111111",' +
      '"type":"door_unlocked"}'
    expect(canonicalizeJson(payload)).toBe(expected)
  })

  it('serialise null et les booléens', async () => {
    const { canonicalizeJson } = await import('../../src/lib/mqtt-hmac.js')
    expect(canonicalizeJson({ a: null, b: true, c: false })).toBe('{"a":null,"b":true,"c":false}')
  })

  it('sérialise les tableaux récursivement', async () => {
    const { canonicalizeJson } = await import('../../src/lib/mqtt-hmac.js')
    expect(canonicalizeJson({ arr: [{ b: 1, a: 2 }, 3] })).toBe('{"arr":[{"a":2,"b":1},3]}')
  })
})

describe('computeSignature / verifySignature', () => {
  it('produit une signature stable, indépendante de l\'ordre d\'insertion', async () => {
    const { computeSignature } = await import('../../src/lib/mqtt-hmac.js')
    const sig1 = computeSignature({ a: 1, b: 2 })
    const sig2 = computeSignature({ b: 2, a: 1 })
    expect(sig1).toBe(sig2)
  })

  it('verifySignature renvoie true pour une signature valide', async () => {
    const { computeSignature, verifySignature } = await import('../../src/lib/mqtt-hmac.js')
    const data = { foo: 'bar', n: 42 }
    const sig = computeSignature(data)
    expect(verifySignature(data, sig)).toBe(true)
  })

  it('verifySignature renvoie false pour une signature altérée', async () => {
    const { computeSignature, verifySignature } = await import('../../src/lib/mqtt-hmac.js')
    const data = { foo: 'bar' }
    const good = computeSignature(data)
    // Flip un char (toujours hex valide, longueur identique → on teste la
    // partie "comparaison" et pas le shortcut early-return sur la length).
    const tampered = good[0] === '0' ? '1' + good.slice(1) : '0' + good.slice(1)
    expect(verifySignature(data, tampered)).toBe(false)
  })

  it('verifySignature renvoie false si la longueur ne correspond pas', async () => {
    const { verifySignature } = await import('../../src/lib/mqtt-hmac.js')
    expect(verifySignature({ a: 1 }, 'short')).toBe(false)
  })

  it('verifySignature renvoie false si sig n\'est pas du hex valide', async () => {
    const { computeSignature, verifySignature } = await import('../../src/lib/mqtt-hmac.js')
    const goodLen = computeSignature({ a: 1 }).length
    expect(verifySignature({ a: 1 }, 'z'.repeat(goodLen))).toBe(false)
  })

  it('match exactement HMAC-SHA256 du payload canonique avec le secret partagé', async () => {
    const { computeSignature } = await import('../../src/lib/mqtt-hmac.js')
    const data = { hello: 'world' }
    const canonical = '{"hello":"world"}'
    const expected = createHmac('sha256', process.env.JWT_DEVICE_SECRET!)
      .update(canonical)
      .digest('hex')
    expect(computeSignature(data)).toBe(expected)
  })
})

describe('parseSignedEnvelope', () => {
  it('parse une enveloppe bien formée', async () => {
    const { parseSignedEnvelope } = await import('../../src/lib/mqtt-hmac.js')
    const out = parseSignedEnvelope({ data: { a: 1 }, sig: 'deadbeef' })
    expect(out).toEqual({ data: { a: 1 }, sig: 'deadbeef' })
  })

  it('renvoie null sur un payload non-objet', async () => {
    const { parseSignedEnvelope } = await import('../../src/lib/mqtt-hmac.js')
    expect(parseSignedEnvelope(null)).toBeNull()
    expect(parseSignedEnvelope('foo')).toBeNull()
    expect(parseSignedEnvelope(42)).toBeNull()
  })

  it('renvoie null si data ou sig manquent', async () => {
    const { parseSignedEnvelope } = await import('../../src/lib/mqtt-hmac.js')
    expect(parseSignedEnvelope({ data: { a: 1 } })).toBeNull()
    expect(parseSignedEnvelope({ sig: 'x' })).toBeNull()
    expect(parseSignedEnvelope({ data: 'not-an-object', sig: 'x' })).toBeNull()
  })
})
