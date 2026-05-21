import { z } from 'zod'
import { SlotDurationMinutes } from './enums'

/**
 * Règle tarifaire : prix d'un slot de N minutes pour un item_type donné dans
 * une commune donnée. L'absence de règle = ce slot n'est pas proposé.
 * Source de vérité : table `pricing_rules` (migration 0008).
 */
export const PricingRule = z.object({
  id: z.string().uuid(),
  communeId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  durationMinutes: SlotDurationMinutes,
  priceCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PricingRule = z.infer<typeof PricingRule>

/**
 * Input dashboard : upsert d'une ligne tarifaire pour le tenant courant.
 * `communeId` est imposé par le scoping admin côté API (pas dans l'input client).
 */
export const UpsertPricingRuleInput = z.object({
  itemTypeId: z.string().uuid(),
  durationMinutes: SlotDurationMinutes,
  priceCents: z.number().int().nonnegative(),
})
export type UpsertPricingRuleInput = z.infer<typeof UpsertPricingRuleInput>
