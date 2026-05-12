import { z } from 'zod'

export const UserRole = z.enum(['citizen', 'operator', 'admin'])
export type UserRole = z.infer<typeof UserRole>

export const DistributorStatus = z.enum(['online', 'offline', 'maintenance', 'decommissioned'])
export type DistributorStatus = z.infer<typeof DistributorStatus>

export const LockerState = z.enum(['idle', 'reserved', 'active', 'returning', 'fault'])
export type LockerState = z.infer<typeof LockerState>

export const ReservationStatus = z.enum([
  'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
])
export type ReservationStatus = z.infer<typeof ReservationStatus>

export const ItemCondition = z.enum(['new', 'good', 'worn', 'damaged', 'lost'])
export type ItemCondition = z.infer<typeof ItemCondition>
