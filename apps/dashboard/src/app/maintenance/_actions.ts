'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  ApiError,
  MAINTENANCE_STATUSES,
  type MaintenanceStatus,
  updateMaintenanceTicket,
} from '../../lib/api'

export type ActionResult = { ok: true } | { ok: false; error: string }

const STATUSES = new Set<string>(MAINTENANCE_STATUSES)

export async function changeTicketStatusAction(
  id: string,
  nextStatus: MaintenanceStatus,
): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'invalid_id' }
  if (!STATUSES.has(nextStatus)) return { ok: false, error: 'invalid_status' }

  try {
    await updateMaintenanceTicket(id, { status: nextStatus })
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return { ok: false, error: 'Authentification requise (DASHBOARD_ADMIN_TOKEN).' }
      if (err.status === 403) return { ok: false, error: 'Token sans rôle admin.' }
      if (err.status === 404) return { ok: false, error: 'Ticket introuvable.' }
      return { ok: false, error: `API ${err.status}: ${err.detail}` }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' }
  }

  revalidatePath('/maintenance')
  revalidateTag('maintenance')
  return { ok: true }
}
