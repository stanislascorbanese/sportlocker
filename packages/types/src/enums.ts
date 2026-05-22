import { z } from 'zod'

export const UserRole = z.enum(['citizen', 'operator', 'admin'])
export type UserRole = z.infer<typeof UserRole>

export const DistributorStatus = z.enum(['online', 'offline', 'maintenance', 'decommissioned'])
export type DistributorStatus = z.infer<typeof DistributorStatus>

export const LockerState = z.enum(['idle', 'reserved', 'active', 'returning', 'fault'])
export type LockerState = z.infer<typeof LockerState>

export const ReservationStatus = z.enum([
  'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
])
export type ReservationStatus = z.infer<typeof ReservationStatus>

/**
 * Durées autorisées pour un slot (en minutes). Cohérent avec
 * `pricing_rules.duration_minutes` et `reservations.duration_minutes` côté DB
 * (CHECK constraints maintenues par migrations 0008 + 0009).
 *
 * Valeurs :
 *   - 30 / 60 / 90 / 120 : slots courts (modèle de base PR 0008)
 *   - 1440               : forfait journée (PR 0009, équivalent du day pass)
 *
 * La modularité opérateur se fait par la présence ou l'absence de
 * `pricing_rules` pour chaque triplet (commune × item_type × duration) :
 * un tenant qui ne crée des règles QUE sur 1440 propose uniquement du
 * forfait journée ; mixer 30 et 1440 propose les deux modes.
 */
export const DAY_PASS_MINUTES = 1440 as const

export const SlotDurationMinutes = z.union([
  z.literal(30), z.literal(60), z.literal(90), z.literal(120), z.literal(1440),
])
export type SlotDurationMinutes = z.infer<typeof SlotDurationMinutes>

export const SLOT_DURATIONS_MINUTES = [30, 60, 90, 120, 1440] as const

export function isDayPass(d: number): boolean {
  return d === DAY_PASS_MINUTES
}

export const ItemCondition = z.enum(['new', 'good', 'worn', 'damaged', 'lost'])
export type ItemCondition = z.infer<typeof ItemCondition>
