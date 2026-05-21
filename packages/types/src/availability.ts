import { z } from 'zod'
import { SlotDurationMinutes } from './enums.js'

/**
 * Un créneau réservable retourné par `GET /v1/distributors/:id/availability`.
 * `available` est faux quand au moins un item du type demandé est déjà pris
 * sur la fenêtre `[startsAt, endsAt)`. `priceCents` est nul si aucune règle
 * `pricing_rules` n'est définie pour ce (commune × item_type × duration).
 */
export const AvailabilitySlot = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  durationMinutes: SlotDurationMinutes,
  available: z.boolean(),
  priceCents: z.number().int().nonnegative().nullable(),
})
export type AvailabilitySlot = z.infer<typeof AvailabilitySlot>

/**
 * Réponse de la route de disponibilité, groupée par jour ISO pour faciliter
 * le rendu calendaire côté app web booking (J → J+7).
 */
export const AvailabilityResponse = z.object({
  distributorId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  durationMinutes: SlotDurationMinutes,
  // Map ISO date (YYYY-MM-DD, fuseau Europe/Paris) → liste de slots.
  days: z.record(z.string(), z.array(AvailabilitySlot)),
})
export type AvailabilityResponse = z.infer<typeof AvailabilityResponse>
