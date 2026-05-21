import { z } from 'zod'
import { ReservationStatus, SlotDurationMinutes } from './enums.js'

export const Reservation = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  status: ReservationStatus,
  qrJti: z.string(),
  expiresAt: z.string().datetime(),
  openedAt: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
  // Modèle slots (migration 0008). Nullable pour les résas historiques.
  slotStartAt: z.string().datetime().nullable(),
  slotEndAt: z.string().datetime().nullable(),
  durationMinutes: SlotDurationMinutes.nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
})

export type Reservation = z.infer<typeof Reservation>

/**
 * Création d'une réservation dans le modèle slots :
 *   - `slotStartAt` doit être aligné sur un créneau valide (ex. :00 ou :30
 *     selon la grille du distributeur) — la validation fine est faite côté API.
 *   - `durationMinutes` doit correspondre à un tarif configuré côté tenant
 *     (sinon 422 `no_pricing`).
 *   - Pas de `lockerId` ni `itemId` : l'API choisit un item dispo du bon type
 *     pour le créneau demandé.
 */
export const CreateReservationInput = z.object({
  distributorId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  slotStartAt: z.string().datetime(),
  durationMinutes: SlotDurationMinutes,
})
export type CreateReservationInput = z.infer<typeof CreateReservationInput>
