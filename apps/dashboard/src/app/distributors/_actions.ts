'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  ApiError,
  DistributorCreateInput,
  DistributorUpdateInput,
  createDistributor,
  updateDistributor,
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

const CreateForm = z.object({
  serialNumber: z.string().trim().min(3).max(40),
  communeId:    z.string().trim().uuid(),
  name:         z.string().trim().min(1).max(120),
  latitude:     optionalNumber.pipe(z.number().min(-90).max(90).optional()),
  longitude:    optionalNumber.pipe(z.number().min(-180).max(180).optional()),
  lockerCount:  z.coerce.number().int().min(1).max(64),
})

const UpdateForm = z.object({
  name:      z.string().trim().min(1).max(120),
  status:    z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
  latitude:  optionalNumber.pipe(z.number().min(-90).max(90).optional()),
  longitude: optionalNumber.pipe(z.number().min(-180).max(180).optional()),
})

export async function createDistributorAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = CreateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: DistributorCreateInput = {
    serialNumber: parsed.data.serialNumber,
    communeId:    parsed.data.communeId,
    name:         parsed.data.name,
    lockerCount:  parsed.data.lockerCount,
    latitude:     parsed.data.latitude ?? null,
    longitude:    parsed.data.longitude ?? null,
  }

  try {
    await createDistributor(input)
  } catch (err) {
    return apiErrorToState(err)
  }

  revalidatePath('/distributors')
  revalidatePath('/')
  revalidatePath('/map')
  revalidateTag('distributors')
  redirect('/distributors')
}

export async function updateDistributorAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = UpdateForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return zodToState(parsed.error)

  const input: DistributorUpdateInput = {
    name:      parsed.data.name,
    status:    parsed.data.status,
    latitude:  parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
  }

  try {
    await updateDistributor(id, input)
  } catch (err) {
    return apiErrorToState(err)
  }

  revalidatePath('/distributors')
  revalidatePath(`/distributors/${id}/edit`)
  revalidatePath('/')
  revalidatePath('/map')
  revalidateTag('distributors')
  revalidateTag(`distributor:${id}`)
  redirect('/distributors')
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
    if (err.status === 401) return { status: 'error', message: 'Authentification requise (DASHBOARD_ADMIN_TOKEN absent ou invalide).' }
    if (err.status === 403) return { status: 'error', message: 'Token sans rôle admin.' }
    if (err.status === 409) return { status: 'error', message: 'Numéro de série déjà utilisé.' }
    if (err.status === 404) return { status: 'error', message: err.detail }
    return { status: 'error', message: `API ${err.status}: ${err.detail}` }
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue.' }
}
