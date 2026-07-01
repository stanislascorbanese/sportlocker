/**
 * Tests unitaires du filtrage de diffusion temps réel (scope multi-tenant).
 * Pas de Docker/Redis : fonction pure.
 */
import { describe, expect, it } from 'vitest'

import type { LiveEvent } from '@sportlocker/types'

import { shouldDeliver } from '../../src/lib/live-filter.js'

const COMMUNE_A = '11111111-1111-4111-8111-111111111111'
const COMMUNE_B = '22222222-2222-4222-8222-222222222222'
const DIST_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DIST_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function distEvent(communeId: string, distributorId: string): LiveEvent {
  return {
    v: 1,
    kind: 'distributor',
    distributorId,
    communeId,
    status: 'online',
    idleLockers: 3,
    lastSeenAt: '2026-06-30T10:00:00.000Z',
    at: '2026-06-30T10:00:00.000Z',
  }
}

describe('shouldDeliver — scope commune', () => {
  it('super_admin (communeId null) reçoit toutes les communes', () => {
    const client = { communeId: null, distributorId: null }
    expect(shouldDeliver(client, distEvent(COMMUNE_A, DIST_1))).toBe(true)
    expect(shouldDeliver(client, distEvent(COMMUNE_B, DIST_2))).toBe(true)
  })

  it('un admin ne reçoit que sa commune', () => {
    const client = { communeId: COMMUNE_A, distributorId: null }
    expect(shouldDeliver(client, distEvent(COMMUNE_A, DIST_1))).toBe(true)
    expect(shouldDeliver(client, distEvent(COMMUNE_B, DIST_2))).toBe(false)
  })
})

describe('shouldDeliver — filtre distributeur (page détail)', () => {
  it('ne délivre que le distributeur abonné', () => {
    const client = { communeId: COMMUNE_A, distributorId: DIST_1 }
    expect(shouldDeliver(client, distEvent(COMMUNE_A, DIST_1))).toBe(true)
    expect(shouldDeliver(client, distEvent(COMMUNE_A, DIST_2))).toBe(false)
  })

  it('le filtre distributeur ne contourne pas le scope commune', () => {
    // Défense : même si le client demande DIST_1, un event d'une autre commune
    // portant ce distributorId (impossible en pratique) resterait bloqué.
    const client = { communeId: COMMUNE_A, distributorId: DIST_1 }
    expect(shouldDeliver(client, distEvent(COMMUNE_B, DIST_1))).toBe(false)
  })
})
