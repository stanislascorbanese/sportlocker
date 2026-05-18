'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  ApiError,
  CommuneCreateInput,
  CommuneUpdateInput,
  createCommune,
  updateCommune,
} from '../../lib/api'

export type FormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  fieldErrors?: Record<string, string>
}

const optionalNumber = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : Number(v)))
  .pipe(z.number().optional())

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))

const dateOrNull = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable())

const CreateForm = z.object({
  inseeCode:       z.string().trim().regex(/^\d{5}$/, '5 chiffres requis'),
  name:            z.string().trim().min(1).max(120),
  postalCode:      z.string().trim().regex(/^\d{5}$/, '5 chiffres requis'),
  department:      z.string().trim().min(2).max(3),
  region:          z.string().trim().min(1).max(60),
  population:      optionalNumber.pipe(z.number().int().positive().optional()),
  contractStart:   dateOrNull,
  contractEnd:     dateOrNull,
  monthlyFeeEuros: z.coerce.number().min(0).max(10_000),
  contactEmail:    optionalString.pipe(z.string().email().nullable().or(z.literal(null))),
  contactPhone:    optionalString,
})

const UpdateForm = z.object({
  name:            z.string().trim().min(1).max(120),
  postalCode:      z.string().trim().regex(/^\d{5}$/),
  department:      z.string().trim().min(2).max(3),
  region:          z.string().trim().min(1).max(60),
  population:      optionalNumber.pipe(z.number().int().positive().optional()),
  contractStart:   dateOrNull,
  contractEnd:     dateOrNull,
  monthlyFeeEuros: z.coerce.number().min(0).max(10_000),
  contactEmail:    optionalString.pipe(z.string().email().nullable().or(z.literal(null))),
  contactPhone:    optionalString,
})

export async function createCommuneAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = CreateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: CommuneCreateInput = {
    inseeCode:       parsed.data.inseeCode,
    name:            parsed.data.name,
    postalCode:      parsed.data.postalCode,
    department:      parsed.data.department,
    region:          parsed.data.region,
    population:      parsed.data.population ?? null,
    contractStart:   parsed.data.contractStart,
    contractEnd:     parsed.data.contractEnd,
    monthlyFeeCents: Math.round(parsed.data.monthlyFeeEuros * 100),
    contactEmail:    parsed.data.contactEmail,
    contactPhone:    parsed.data.contactPhone,
  }

  try {
    await createCommune(input)
  } catch (err) {
    return apiErrorToState(err)
  }

  revalidatePath('/communes')
  revalidateTag('communes')
  redirect('/communes')
}

export async function updateCommuneAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = UpdateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: CommuneUpdateInput = {
    name:            parsed.data.name,
    postalCode:      parsed.data.postalCode,
    department:      parsed.data.department,
    region:          parsed.data.region,
    population:      parsed.data.population ?? null,
    contractStart:   parsed.data.contractStart,
    contractEnd:     parsed.data.contractEnd,
    monthlyFeeCents: Math.round(parsed.data.monthlyFeeEuros * 100),
    contactEmail:    parsed.data.contactEmail,
    contactPhone:    parsed.data.contactPhone,
  }

  try {
    await updateCommune(id, input)
  } catch (err) {
    return apiErrorToState(err)
  }

  revalidatePath('/communes')
  revalidatePath(`/communes/${id}/edit`)
  revalidateTag('communes')
  revalidateTag(`commune:${id}`)
  redirect('/communes')
}

function zodToState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (path && !fieldErrors[path]) fieldErrors[path] = issue.message
  }
  return { status: 'error', message: 'Validation échouée.', fieldErrors }
}

function apiErrorToState(err: unknown): FormState {
  if (err instanceof ApiError) {
    if (err.status === 401) return { status: 'error', message: 'Session expirée. Reconnectez-vous.' }
    if (err.status === 403) return { status: 'error', message: 'Token sans rôle admin.' }
    if (err.status === 409) return { status: 'error', message: 'Code INSEE déjà utilisé.' }
    if (err.status === 404) return { status: 'error', message: 'Commune introuvable.' }
    return { status: 'error', message: `API ${err.status}: ${err.detail}` }
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue.' }
}
