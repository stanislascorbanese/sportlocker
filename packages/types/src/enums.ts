import { z } from 'zod'

export const UserRole = z.enum(['citizen', 'operator', 'admin', 'super_admin'])
export type UserRole = z.infer<typeof UserRole>

export const DistributorStatus = z.enum(['online', 'offline', 'maintenance', 'decommissioned'])
export type DistributorStatus = z.infer<typeof DistributorStatus>

export const LockerState = z.enum(['idle', 'reserved', 'active', 'returning', 'fault'])
export type LockerState = z.infer<typeof LockerState>

/**
 * Statut d'une réservation. **Source de vérité** : enum SQL `reservation_status`
 * dans `database/schema.sql`. Garder ce tableau en synchro à chaque ajout
 * de valeur côté SQL (`ALTER TYPE reservation_status ADD VALUE`).
 *
 * - `pending_payment` : créneau réservé (slot + item tenus), QR PAS encore émis,
 *   attente de paiement. Ajouté en migration 0013 quand on a branché Stripe.
 * - `scheduled` : créneau futur réservé, QR émis (modèle slots).
 * - `pending` : créée, casier réservé, QR émis (legacy modèle immédiat).
 * - `active` : item retiré.
 * - `returned` : rendu dans les délais.
 * - `overdue` : non rendu après 24h.
 * - `cancelled` : annulée avant ouverture.
 * - `expired` : QR expiré sans ouverture (auto-libération casier).
 */
export const ReservationStatus = z.enum([
  'pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired',
])
export type ReservationStatus = z.infer<typeof ReservationStatus>

/**
 * Statut d'un paiement. Source de vérité : enum SQL `payment_status` introduit
 * en migration 0013.
 */
export const PaymentStatus = z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded'])
export type PaymentStatus = z.infer<typeof PaymentStatus>

/**
 * Provider de paiement. `simulate` = aucun appel Stripe, auto-réussit
 * (dev offline, même esprit que les routes /v1/dev). `stripe` = vraie API
 * (clés requises, cf. garde-fou env.ts côté API).
 */
export const PaymentProvider = z.enum(['stripe', 'simulate'])
export type PaymentProvider = z.infer<typeof PaymentProvider>

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
