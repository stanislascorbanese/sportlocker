import { describe, expect, it } from 'vitest'

import { nextBackoffMs } from './backoff'

describe('nextBackoffMs', () => {
  // random=0.5 → jitter neutre (1 + (0.5*0.4 - 0.2) = 1) → valeur brute exacte.
  const noJitter = { random: () => 0.5 }

  it('croît exponentiellement : 1s, 2s, 4s, 8s', () => {
    expect(nextBackoffMs(0, noJitter)).toBe(1_000)
    expect(nextBackoffMs(1, noJitter)).toBe(2_000)
    expect(nextBackoffMs(2, noJitter)).toBe(4_000)
    expect(nextBackoffMs(3, noJitter)).toBe(8_000)
  })

  it('plafonne au cap (30s par défaut)', () => {
    expect(nextBackoffMs(20, noJitter)).toBe(30_000)
  })

  it('applique un jitter borné à ±20%', () => {
    const min = nextBackoffMs(3, { random: () => 0 })   // -20%
    const max = nextBackoffMs(3, { random: () => 1 })   // +20%
    expect(min).toBe(6_400)
    expect(max).toBe(9_600)
  })

  it('traite un attempt négatif comme 0', () => {
    expect(nextBackoffMs(-5, noJitter)).toBe(1_000)
  })
})
