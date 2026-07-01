import { beforeEach, describe, expect, it } from 'vitest'

import type { ReservationActive } from './api'
import {
  clearOfflineReservation,
  persistOrClearOfflineReservation,
  readOfflineReservation,
} from './offline-reservation'

const STORAGE_KEY = 'sl-active-reservation'

/** Fabrique une résa active valide vis-à-vis du schéma `ReservationActive`. */
function makeReservation(overrides: Partial<ReservationActive> = {}): ReservationActive {
  const inOneHour = new Date(Date.now() + 60 * 60_000).toISOString()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'active',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: inOneHour,
    extensionCount: 0,
    qrToken: 'a'.repeat(40),
    distributor: { id: '22222222-2222-4222-8222-222222222222', name: 'Gymnase Jean Moulin' },
    item: { id: '33333333-3333-4333-8333-333333333333', typeName: 'Ballon de basket' },
    ...overrides,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('offline-reservation', () => {
  it('persiste puis relit une résa active avec QR valide', () => {
    const r = makeReservation()
    persistOrClearOfflineReservation(r)
    expect(readOfflineReservation()).toEqual(r)
  })

  it('persiste aussi les statuts scheduled et pending', () => {
    for (const status of ['scheduled', 'pending'] as const) {
      window.localStorage.clear()
      persistOrClearOfflineReservation(makeReservation({ status }))
      expect(readOfflineReservation()?.status).toBe(status)
    }
  })

  it('ne cache pas une résa pending_payment (qrToken null) et purge l\'existant', () => {
    persistOrClearOfflineReservation(makeReservation()) // pré-remplit
    persistOrClearOfflineReservation(
      makeReservation({ status: 'pending_payment', qrToken: null }),
    )
    expect(readOfflineReservation()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ne cache pas un statut terminal (returned) même avec un token résiduel', () => {
    persistOrClearOfflineReservation(makeReservation({ status: 'returned' }))
    expect(readOfflineReservation()).toBeNull()
  })

  it('purge le cache quand on passe null (plus de résa active → 404)', () => {
    persistOrClearOfflineReservation(makeReservation())
    persistOrClearOfflineReservation(null)
    expect(readOfflineReservation()).toBeNull()
  })

  it('ne persiste pas une résa déjà expirée', () => {
    persistOrClearOfflineReservation(
      makeReservation({ expiresAt: new Date(Date.now() - 1_000).toISOString() }),
    )
    expect(readOfflineReservation()).toBeNull()
  })

  it('refuse et purge un snapshot dont le token a expiré depuis sa mise en cache', () => {
    // Écrit directement un snapshot expiré (simule un token mis en cache il y a
    // plus longtemps que la fenêtre de résa).
    const stale = makeReservation({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stale))
    expect(readOfflineReservation()).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ne stocke jamais le marqueur transient `offline`', () => {
    persistOrClearOfflineReservation(makeReservation({ offline: true }))
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string).offline).toBeUndefined()
    expect(readOfflineReservation()?.offline).toBeUndefined()
  })

  it('renvoie null et purge un localStorage corrompu', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(readOfflineReservation()).toBeNull()
  })

  it('clearOfflineReservation vide le cache', () => {
    persistOrClearOfflineReservation(makeReservation())
    clearOfflineReservation()
    expect(readOfflineReservation()).toBeNull()
  })
})
