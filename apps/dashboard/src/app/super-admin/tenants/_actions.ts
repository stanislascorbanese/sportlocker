'use server'

import { z } from 'zod'

import { ApiError, createInvite } from '../../../lib/api'

const InviteInput = z.object({
  email: z.string().email().max(180),
  communeId: z.string().uuid(),
})

export type InviteFormState =
  | { status: 'idle' }
  | { status: 'success'; inviteUrl: string; token: string; email: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

export async function createInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const raw = {
    email:     String(formData.get('email') ?? '').trim(),
    communeId: String(formData.get('communeId') ?? ''),
  }
  const parsed = InviteInput.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const i of parsed.error.issues) {
      const path = i.path.join('.')
      if (path && !fieldErrors[path]) fieldErrors[path] = i.message
    }
    return { status: 'error', message: 'Validation échouée.', fieldErrors }
  }

  try {
    const invite = await createInvite(parsed.data)
    return {
      status: 'success',
      inviteUrl: invite.inviteUrl,
      token: invite.token,
      email: parsed.data.email,
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return { status: 'error', message: 'Session expirée. Reconnectez-vous.' }
      if (err.status === 403) return { status: 'error', message: 'Action réservée aux super-admins.' }
      if (err.status === 409) return { status: 'error', message: 'Une invitation existe déjà pour cet email.' }
      return { status: 'error', message: `API ${err.status}: ${err.detail}` }
    }
    return { status: 'error', message: err instanceof Error ? err.message : 'Erreur inconnue.' }
  }
}
