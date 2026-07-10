import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReservationHistoryItem } from '../../../lib/api'
import { actualDurationMinutes, qrRefetchInterval, returnedLate } from './reservation-logic'

afterEach(() => {
  vi.useRealTimers()
})

/** Fixe l'horloge à 2026-06-01T10:00:00Z pour les cas dépendant de `Date.now()`. */
function freezeNow(): void {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-01T10:00:00.000Z'))
}

describe('qrRefetchInterval', () => {
  it('30s sans données', () => {
    expect(qrRefetchInterval(null)).toBe(30_000)
  })

  it('3s tant que le paiement n\'est pas réglé', () => {
    expect(
      qrRefetchInterval({ status: 'pending_payment', expiresAt: '2100-01-01T00:00:00.000Z' }),
    ).toBe(3_000)
  })

  it('5s à moins d\'1 min de l\'expiration', () => {
    freezeNow()
    expect(
      qrRefetchInterval({ status: 'pending', expiresAt: '2026-06-01T10:00:30.000Z' }),
    ).toBe(5_000)
  })

  it('15s entre 1 et 5 min de l\'expiration', () => {
    freezeNow()
    expect(
      qrRefetchInterval({ status: 'scheduled', expiresAt: '2026-06-01T10:03:00.000Z' }),
    ).toBe(15_000)
  })

  it('30s loin de l\'expiration', () => {
    freezeNow()
    expect(
      qrRefetchInterval({ status: 'active', expiresAt: '2026-06-01T10:30:00.000Z' }),
    ).toBe(30_000)
  })

  it('30s une fois expiré', () => {
    freezeNow()
    expect(
      qrRefetchInterval({ status: 'pending', expiresAt: '2026-06-01T09:59:00.000Z' }),
    ).toBe(30_000)
  })
})

function histItem(overrides: Partial<ReservationHistoryItem> = {}): ReservationHistoryItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'returned',
    createdAt: '2026-06-01T09:00:00.000Z',
    expiresAt: '2026-06-01T09:15:00.000Z',
    dueAt: null,
    openedAt: null,
    returnedAt: null,
    extensionCount: 0,
    slotStartAt: null,
    slotEndAt: null,
    durationMinutes: null,
    priceCents: null,
    distributor: { id: '00000000-0000-0000-0000-000000000099', name: 'Test' },
    item: { id: '00000000-0000-0000-0000-000000000042', typeName: 'Ballon' },
    ...overrides,
  }
}

describe('actualDurationMinutes', () => {
  it('calcule le temps réel openedAt → returnedAt', () => {
    expect(
      actualDurationMinutes(
        histItem({ openedAt: '2026-06-01T10:00:00.000Z', returnedAt: '2026-06-01T10:45:00.000Z' }),
      ),
    ).toBe(45)
  })

  it('plancher à 1 min pour un emprunt très court', () => {
    expect(
      actualDurationMinutes(
        histItem({ openedAt: '2026-06-01T10:00:00.000Z', returnedAt: '2026-06-01T10:00:20.000Z' }),
      ),
    ).toBe(1)
  })

  it('retombe sur la durée du créneau si pas de temps réel', () => {
    expect(actualDurationMinutes(histItem({ durationMinutes: 60 }))).toBe(60)
  })

  it('null si aucune donnée exploitable', () => {
    expect(actualDurationMinutes(histItem())).toBeNull()
  })
})

describe('returnedLate', () => {
  it('true si rendu après l\'échéance', () => {
    expect(
      returnedLate(
        histItem({ dueAt: '2026-06-01T10:00:00.000Z', returnedAt: '2026-06-01T10:05:00.000Z' }),
      ),
    ).toBe(true)
  })

  it('false si rendu à l\'heure', () => {
    expect(
      returnedLate(
        histItem({ dueAt: '2026-06-01T10:00:00.000Z', returnedAt: '2026-06-01T09:55:00.000Z' }),
      ),
    ).toBe(false)
  })

  it('false si dueAt ou returnedAt manquant', () => {
    expect(returnedLate(histItem({ returnedAt: '2026-06-01T10:00:00.000Z' }))).toBe(false)
  })
})
