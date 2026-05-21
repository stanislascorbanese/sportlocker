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
 * `pricing_rules.duration_minutes` et `reservations.duration_minutes` côté DB.
 */
export const SlotDurationMinutes = z.union([
  z.literal(30), z.literal(60), z.literal(90), z.literal(120),
])
export type SlotDurationMinutes = z.infer<typeof SlotDurationMinutes>

export const SLOT_DURATIONS_MINUTES = [30, 60, 90, 120] as const

export const ItemCondition = z.enum(['new', 'good', 'worn', 'damaged', 'lost'])
export type ItemCondition = z.infer<typeof ItemCondition>
