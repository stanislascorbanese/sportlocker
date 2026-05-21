'use server'

import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import {
  ApiError,
  SLOT_DURATIONS,
  type SlotDurationMinutes,
  bulkUpsertPricingRules,
  deletePricingRule,
  fetchAdminItemTypes,
  upsertPricingRule,
} from '../../lib/api'
import { PRICING_TEMPLATES } from './templates'

export type ActionState = {
  status: 'idle' | 'success' | 'error'
  message?: string
}

const DurationLiteral = z.coerce.number().int()
  .refine((n): n is SlotDurationMinutes => (SLOT_DURATIONS as readonly number[]).includes(n), {
    message: 'duration_not_allowed',
  })

const UpsertForm = z.object({
  itemTypeId: z.string().uuid(),
  durationMinutes: DurationLiteral,
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
})

/**
 * Server action appelée par une cellule de la matrice à la perte de focus
 * (onBlur). Idempotent : upsert sur le triplet unique (commune, item_type,
 * duration). Le scope commune est implicite (admin scopé) — super_admin
 * doit utiliser la page super-admin spécifique (hors PR).
 */
export async function upsertPricingRuleAction(formData: FormData): Promise<ActionState> {
  const parsed = UpsertForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: 'validation_error' }
  }

  try {
    await upsertPricingRule({
      itemTypeId: parsed.data.itemTypeId,
      durationMinutes: parsed.data.durationMinutes,
      priceCents: parsed.data.priceCents,
    })
    revalidateTag('pricing-rules')
    return { status: 'success' }
  } catch (err) {
    if (err instanceof ApiError) {
      return { status: 'error', message: err.detail }
    }
    return { status: 'error', message: 'unexpected_error' }
  }
}

const DeleteForm = z.object({ id: z.string().uuid() })

export async function deletePricingRuleAction(formData: FormData): Promise<ActionState> {
  const parsed = DeleteForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { status: 'error', message: 'validation_error' }

  try {
    await deletePricingRule(parsed.data.id)
    revalidateTag('pricing-rules')
    return { status: 'success' }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return { status: 'success' }  // déjà supprimée, idempotent
    }
    return { status: 'error', message: err instanceof ApiError ? err.detail : 'unexpected_error' }
  }
}

const ApplyTemplateForm = z.object({
  templateId: z.enum(['communal-leger', 'saisonnier-plage', 'hotel-premium']),
})

/**
 * Applique un template : pour chaque ligne du template, match les item_types
 * existants par substring sur (name/category/slug) — case-insensitive — puis
 * upsert les prix. Renvoie le nombre de règles appliquées.
 */
export async function applyTemplateAction(formData: FormData): Promise<ActionState> {
  const parsed = ApplyTemplateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { status: 'error', message: 'validation_error' }

  const template = PRICING_TEMPLATES.find((t) => t.id === parsed.data.templateId)
  if (!template) return { status: 'error', message: 'template_not_found' }

  try {
    const itemTypes = await fetchAdminItemTypes()
    const rules: Array<{
      itemTypeId: string
      durationMinutes: SlotDurationMinutes
      priceCents: number
    }> = []

    for (const row of template.rows) {
      const hint = row.categoryHint.toLowerCase()
      const matching = itemTypes.filter((t) => {
        const haystack = `${t.name} ${t.category} ${t.slug}`.toLowerCase()
        return haystack.includes(hint)
      })
      for (const it of matching) {
        for (const dur of SLOT_DURATIONS) {
          const cents = row.prices[dur]
          if (cents !== undefined) {
            rules.push({ itemTypeId: it.id, durationMinutes: dur, priceCents: cents })
          }
        }
      }
    }

    if (rules.length === 0) {
      return {
        status: 'error',
        message: 'no_matching_item_types',
      }
    }

    const { applied } = await bulkUpsertPricingRules({ rules })
    revalidateTag('pricing-rules')
    return { status: 'success', message: `${applied}_rules_applied` }
  } catch (err) {
    if (err instanceof ApiError) {
      return { status: 'error', message: err.detail }
    }
    return { status: 'error', message: 'unexpected_error' }
  }
}
