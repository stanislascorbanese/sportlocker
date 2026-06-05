/**
 * Tests pour les helpers de mapping enum → label localisé.
 * Garantit que chaque valeur d'enum a un label dans FR et EN.
 */
import { describe, expect, it } from 'vitest'

import { lockerEventLabel } from './audit'
import { mapFirebaseError } from './auth'
import { conditionLabel } from './items'
import { roleLabel } from './me'
import { paymentStatusLabel } from './payments'
import { reservationStatusLabel } from './stats'
import { userRoleLabel } from './users'

import type { ItemCondition, LockerEventType, PaymentStatus, ReservationStatus, UserRole } from '../api'
import type { SessionPayload } from '../session'

describe('lockerEventLabel', () => {
  const events: LockerEventType[] = [
    'reserved', 'opened', 'closed', 'extended', 'returned',
    'cancelled', 'expired', 'fault', 'maintenance',
  ]

  it.each(events)('FR returns a non-empty label for %s', (evt) => {
    const label = lockerEventLabel('fr', evt)
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(0)
  })

  it.each(events)('EN returns a non-empty label for %s', (evt) => {
    const label = lockerEventLabel('en', evt)
    expect(label).toBeTruthy()
    expect(label.length).toBeGreaterThan(0)
  })

  it('returns different strings FR vs EN for most events', () => {
    // Au moins 5 sur 9 doivent être traduits différemment
    const diff = events.filter((e) => lockerEventLabel('fr', e) !== lockerEventLabel('en', e))
    expect(diff.length).toBeGreaterThanOrEqual(5)
  })
})

describe('reservationStatusLabel', () => {
  const statuses: ReservationStatus[] = [
    'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
  ]

  it.each(statuses)('FR returns a non-empty label for %s', (s) => {
    expect(reservationStatusLabel('fr', s)).toBeTruthy()
  })

  it.each(statuses)('EN returns a non-empty label for %s', (s) => {
    expect(reservationStatusLabel('en', s)).toBeTruthy()
  })
})

describe('conditionLabel', () => {
  const conditions: ItemCondition[] = ['new', 'good', 'worn', 'damaged', 'lost']

  it.each(conditions)('FR returns a non-empty label for %s', (c) => {
    expect(conditionLabel('fr', c)).toBeTruthy()
  })

  it.each(conditions)('EN returns a non-empty label for %s', (c) => {
    expect(conditionLabel('en', c)).toBeTruthy()
  })

  it('FR labels are translated (different from EN slug)', () => {
    expect(conditionLabel('fr', 'damaged')).toBe('endommagé')
    expect(conditionLabel('en', 'damaged')).toBe('damaged')
  })
})

describe('paymentStatusLabel', () => {
  const statuses: PaymentStatus[] = ['succeeded', 'pending', 'failed', 'cancelled', 'refunded']

  it.each(statuses)('FR returns a non-empty label for %s', (s) => {
    expect(paymentStatusLabel('fr', s)).toBeTruthy()
  })

  it('FR succeeded is "Payé"', () => {
    expect(paymentStatusLabel('fr', 'succeeded')).toBe('Payé')
  })

  it('EN succeeded is "Paid"', () => {
    expect(paymentStatusLabel('en', 'succeeded')).toBe('Paid')
  })
})

describe('userRoleLabel', () => {
  const roles: UserRole[] = ['citizen', 'operator', 'admin', 'super_admin']

  it.each(roles)('FR returns a non-empty label for %s', (r) => {
    expect(userRoleLabel('fr', r)).toBeTruthy()
  })

  it.each(roles)('EN returns a non-empty label for %s', (r) => {
    expect(userRoleLabel('en', r)).toBeTruthy()
  })
})

describe('roleLabel (me)', () => {
  const roles: SessionPayload['role'][] = ['super_admin', 'admin', 'operator']

  it.each(roles)('FR returns a non-empty label for %s', (r) => {
    expect(roleLabel('fr', r)).toBeTruthy()
  })

  it('FR translates super_admin → Super-admin', () => {
    expect(roleLabel('fr', 'super_admin')).toBe('Super-admin')
    expect(roleLabel('fr', 'admin')).toBe('Admin')
    expect(roleLabel('fr', 'operator')).toBe('Opérateur')
  })

  it('EN keeps slug-like English forms', () => {
    expect(roleLabel('en', 'super_admin')).toBe('Super-admin')
    expect(roleLabel('en', 'operator')).toBe('Operator')
  })
})

describe('mapFirebaseError', () => {
  const codes = [
    'auth/invalid-email',
    'auth/user-disabled',
    'auth/user-not-found',
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/too-many-requests',
    'auth/unknown-code',
  ]

  it.each(codes)('FR returns a non-empty message for %s', (code) => {
    expect(mapFirebaseError('fr', code)).toBeTruthy()
  })

  it.each(codes)('EN returns a non-empty message for %s', (code) => {
    expect(mapFirebaseError('en', code)).toBeTruthy()
  })

  it('FR specific message for invalid-email', () => {
    expect(mapFirebaseError('fr', 'auth/invalid-email')).toBe('Adresse email invalide.')
  })

  it('EN specific message for too-many-requests', () => {
    expect(mapFirebaseError('en', 'auth/too-many-requests')).toBe(
      'Too many attempts. Try again in a few minutes.',
    )
  })

  it('unknown code falls back to generic FR message', () => {
    expect(mapFirebaseError('fr', 'auth/something-weird')).toBe('Connexion impossible. Réessayez.')
  })

  it('unknown code falls back to generic EN message', () => {
    expect(mapFirebaseError('en', 'auth/something-weird')).toBe('Sign-in failed. Please retry.')
  })
})
