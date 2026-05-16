'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  ApiError,
  USER_ROLES,
  type UserRole,
  updateUser,
} from '../../lib/api'

export type ActionResult = { ok: true } | { ok: false; error: string }

const ROLES = new Set<string>(USER_ROLES)
const UUID_RE = /^[0-9a-f-]{36}$/i

async function run(id: string, patch: Parameters<typeof updateUser>[1]): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: 'invalid_id' }
  try {
    await updateUser(id, patch)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return { ok: false, error: 'Authentification requise (token admin).' }
      if (err.status === 403) return { ok: false, error: 'Token sans rôle admin.' }
      if (err.status === 404) return { ok: false, error: 'Utilisateur introuvable.' }
      return { ok: false, error: `API ${err.status}: ${err.detail}` }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' }
  }

  revalidatePath('/users')
  revalidateTag('users')
  return { ok: true }
}

export async function banUserAction(id: string, reason: string): Promise<ActionResult> {
  const r = reason.trim()
  if (r.length < 4) return { ok: false, error: 'Raison trop courte (4 caractères minimum).' }
  return run(id, { isBanned: true, bannedReason: r })
}

export async function unbanUserAction(id: string): Promise<ActionResult> {
  return run(id, { isBanned: false, bannedReason: null })
}

export async function setRoleAction(id: string, role: UserRole): Promise<ActionResult> {
  if (!ROLES.has(role)) return { ok: false, error: 'invalid_role' }
  return run(id, { role })
}

export async function requestGdprDeleteAction(id: string): Promise<ActionResult> {
  return run(id, { gdprDeleteRequestedAt: new Date().toISOString() })
}

export async function cancelGdprDeleteAction(id: string): Promise<ActionResult> {
  return run(id, { gdprDeleteRequestedAt: null })
}

export async function setTrustScoreAction(id: string, score: number): Promise<ActionResult> {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return { ok: false, error: 'Score doit être un entier entre 0 et 100.' }
  }
  return run(id, { trustScore: score })
}
