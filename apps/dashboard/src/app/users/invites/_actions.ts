'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  ApiError,
  createInvite,
  resendInvite,
  revokeInvite,
  type Invite,
} from '../../../lib/api'

export type InviteActionResult =
  | { ok: true; invite: Invite }
  | { ok: false; error: string }

export type SimpleResult = { ok: true } | { ok: false; error: string }

const UUID_RE = /^[0-9a-f-]{36}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function mapApiError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401: return 'Session expirée. Reconnectez-vous.'
      case 403: return err.detail === 'forbidden_cross_commune'
        ? 'Vous ne pouvez inviter que dans votre commune.'
        : 'Action réservée aux administrateurs.'
      case 404: return 'Commune ou invitation introuvable.'
      case 409: return 'Cette invitation a déjà été acceptée.'
      default:  return `API ${err.status}: ${err.detail}`
    }
  }
  return err instanceof Error ? err.message : 'Erreur inconnue.'
}

function revalidateInvites() {
  revalidatePath('/users/invites')
  revalidateTag('invites')
}

export async function createInviteAction(input: {
  email: string
  communeId?: string
}): Promise<InviteActionResult> {
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Email invalide.' }
  if (input.communeId !== undefined && !UUID_RE.test(input.communeId)) {
    return { ok: false, error: 'Commune invalide.' }
  }

  try {
    const invite = await createInvite(
      input.communeId ? { email, communeId: input.communeId } : { email },
    )
    revalidateInvites()
    return { ok: true, invite }
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }
}

export async function resendInviteAction(token: string): Promise<InviteActionResult> {
  if (token.length < 20) return { ok: false, error: 'Token invalide.' }
  try {
    const invite = await resendInvite(token)
    revalidateInvites()
    return { ok: true, invite }
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }
}

export async function revokeInviteAction(token: string): Promise<SimpleResult> {
  if (token.length < 20) return { ok: false, error: 'Token invalide.' }
  try {
    await revokeInvite(token)
    revalidateInvites()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }
}
