'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  ApiError,
  MAINTENANCE_STATUSES,
  type MaintenanceStatus,
  addMaintenanceComment,
  updateMaintenanceTicket,
} from '../../lib/api'

export type ActionResult = { ok: true } | { ok: false; error: string }

const STATUSES = new Set<string>(MAINTENANCE_STATUSES)
const UUID_RE = /^[0-9a-f-]{36}$/i

function mapApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Session expirée. Reconnectez-vous.'
    if (err.status === 403) return 'Token sans rôle admin.'
    if (err.status === 404) return 'Ticket introuvable.'
    return `API ${err.status}: ${err.detail}`
  }
  return err instanceof Error ? err.message : 'Erreur inconnue.'
}

function revalidateTicket(id: string) {
  revalidatePath('/maintenance')
  revalidatePath(`/maintenance/${id}`)
  revalidateTag('maintenance')
}

export async function changeTicketStatusAction(
  id: string,
  nextStatus: MaintenanceStatus,
): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: 'invalid_id' }
  if (!STATUSES.has(nextStatus)) return { ok: false, error: 'invalid_status' }

  try {
    await updateMaintenanceTicket(id, { status: nextStatus })
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }

  revalidateTicket(id)
  return { ok: true }
}

export async function assignTicketAction(
  id: string,
  assignedTo: string | null,
): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: 'invalid_id' }
  if (assignedTo !== null && !UUID_RE.test(assignedTo)) return { ok: false, error: 'invalid_assignee' }

  try {
    await updateMaintenanceTicket(id, { assignedTo })
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }

  revalidateTicket(id)
  return { ok: true }
}

export async function addCommentAction(id: string, body: string): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: 'invalid_id' }
  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: 'empty_comment' }
  if (trimmed.length > 2000) return { ok: false, error: 'comment_too_long' }

  try {
    await addMaintenanceComment(id, trimmed)
  } catch (err) {
    return { ok: false, error: mapApiError(err) }
  }

  revalidateTicket(id)
  return { ok: true }
}
