'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  ApiError,
  ITEM_CONDITIONS,
  ItemCreateInput,
  ItemTypeCreateInput,
  ItemTypeUpdateInput,
  ItemUpdateInput,
  createItem,
  createItemType,
  deleteItemType,
  updateItem,
  updateItemType,
} from '../../lib/api'

export type FormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
}

// ─── Item types ───────────────────────────────────────────────────────────

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().url().nullable())

const ItemTypeCreateForm = z.object({
  slug:               z.string().trim().regex(/^[a-z0-9-]+$/, 'kebab-case requis (a-z, 0-9, -)').min(2).max(60),
  name:               z.string().trim().min(1).max(120),
  category:           z.string().trim().min(1).max(40),
  description:        optionalString,
  imageUrl:           optionalUrl,
  cautionEuros:       z.coerce.number().min(0).max(1_000_000),
  maxDurationMinutes: z.coerce.number().int().min(15).max(7 * 24 * 60),
})

const ItemTypeUpdateForm = z.object({
  name:               z.string().trim().min(1).max(120),
  category:           z.string().trim().min(1).max(40),
  description:        optionalString,
  imageUrl:           optionalUrl,
  cautionEuros:       z.coerce.number().min(0).max(1_000_000),
  maxDurationMinutes: z.coerce.number().int().min(15).max(7 * 24 * 60),
})

export async function createItemTypeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ItemTypeCreateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: ItemTypeCreateInput = {
    slug:               parsed.data.slug,
    name:               parsed.data.name,
    category:           parsed.data.category,
    description:        parsed.data.description,
    imageUrl:           parsed.data.imageUrl,
    cautionCents:       Math.round(parsed.data.cautionEuros * 100),
    maxDurationMinutes: parsed.data.maxDurationMinutes,
  }

  try {
    await createItemType(input)
  } catch (err) {
    return apiErrorToState(err, { slugConflict: 'slug_conflict' })
  }

  revalidatePath('/items')
  revalidateTag('item-types')
  redirect('/items?tab=types')
}

export async function updateItemTypeAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ItemTypeUpdateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: ItemTypeUpdateInput = {
    name:               parsed.data.name,
    category:           parsed.data.category,
    description:        parsed.data.description,
    imageUrl:           parsed.data.imageUrl,
    cautionCents:       Math.round(parsed.data.cautionEuros * 100),
    maxDurationMinutes: parsed.data.maxDurationMinutes,
  }

  try {
    await updateItemType(id, input)
  } catch (err) {
    return apiErrorToState(err)
  }

  revalidatePath('/items')
  revalidatePath(`/items/types/${id}/edit`)
  revalidateTag('item-types')
  revalidateTag(`item-type:${id}`)
  redirect('/items?tab=types')
}

export async function deleteItemTypeAction(id: string): Promise<FormState> {
  try {
    await deleteItemType(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { status: 'error', message: 'Suppression impossible : au moins un article physique utilise encore ce type.' }
    }
    return apiErrorToState(err)
  }
  revalidatePath('/items')
  revalidateTag('item-types')
  return { status: 'success' }
}

// ─── Items physiques ──────────────────────────────────────────────────────

const optionalLockerId = z
  .string()
  .trim()
  .transform((v) => (v === '' || v === '__null__' ? null : v))
  .pipe(z.string().uuid().nullable())

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))

const ItemCreateForm = z.object({
  itemTypeId:      z.string().uuid(),
  rfidTag:         z.string().trim().min(4).max(64),
  condition:       z.enum(ITEM_CONDITIONS),
  currentLockerId: optionalLockerId,
})

const ItemUpdateForm = z.object({
  rfidTag:         z.string().trim().min(4).max(64),
  condition:       z.enum(ITEM_CONDITIONS),
  currentLockerId: optionalLockerId,
  lastInspectedAt: optionalDate,
})

export async function createItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ItemCreateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: ItemCreateInput = {
    itemTypeId:      parsed.data.itemTypeId,
    rfidTag:         parsed.data.rfidTag,
    condition:       parsed.data.condition,
    currentLockerId: parsed.data.currentLockerId,
  }

  try {
    await createItem(input)
  } catch (err) {
    return apiErrorToState(err, { rfidConflict: 'rfid_tag_conflict' })
  }

  revalidatePath('/items')
  revalidateTag('items')
  redirect('/items?tab=instances')
}

export async function updateItemAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ItemUpdateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: ItemUpdateInput = {
    rfidTag:         parsed.data.rfidTag,
    condition:       parsed.data.condition,
    currentLockerId: parsed.data.currentLockerId,
    // Champ date-only converti en ISO datetime (minuit UTC).
    lastInspectedAt: parsed.data.lastInspectedAt
      ? new Date(`${parsed.data.lastInspectedAt}T00:00:00.000Z`).toISOString()
      : null,
  }

  try {
    await updateItem(id, input)
  } catch (err) {
    return apiErrorToState(err, { rfidConflict: 'rfid_tag_conflict' })
  }

  revalidatePath('/items')
  revalidatePath(`/items/instances/${id}/edit`)
  revalidateTag('items')
  revalidateTag(`item:${id}`)
  redirect('/items?tab=instances')
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function zodToState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
  }
  return { status: 'error', message: 'Validation échouée.', fieldErrors }
}

function apiErrorToState(
  err: unknown,
  knownConflicts: { slugConflict?: string; rfidConflict?: string } = {},
): FormState {
  if (err instanceof ApiError) {
    if (err.status === 401) return { status: 'error', message: 'Session expirée. Reconnectez-vous.' }
    if (err.status === 403) return { status: 'error', message: 'Action refusée — privilèges insuffisants.' }
    if (err.status === 404) return { status: 'error', message: 'Ressource introuvable.' }
    if (err.status === 409) {
      if (knownConflicts.slugConflict && err.detail === knownConflicts.slugConflict) {
        return { status: 'error', message: 'Ce slug est déjà utilisé.', fieldErrors: { slug: 'déjà utilisé' } }
      }
      if (knownConflicts.rfidConflict && err.detail === knownConflicts.rfidConflict) {
        return { status: 'error', message: 'Ce tag RFID est déjà associé à un autre article.', fieldErrors: { rfidTag: 'déjà utilisé' } }
      }
      return { status: 'error', message: 'Conflit : ressource déjà existante.' }
    }
    return { status: 'error', message: `API ${err.status}: ${err.detail}` }
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue.' }
}
