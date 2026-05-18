'use server'

import { revalidatePath, revalidateTag } from 'next/cache'

import {
  ApiError,
  fetchReservationsCsv,
  forceCancelReservation,
  type Reservation,
  type ReservationExportFilters,
  type ReservationStatus,
} from '../../lib/api'
import { DEMO_RESERVATIONS } from '../../lib/demo-data'

export type ActionResult = { ok: true } | { ok: false; error: string }

export async function forceCancelReservationAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'invalid_id' }
  const trimmed = reason.trim()
  if (trimmed.length < 4) return { ok: false, error: 'Raison trop courte (4 caractères minimum).' }

  try {
    await forceCancelReservation(id, trimmed)
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return { ok: false, error: 'Authentification requise (token admin).' }
      if (err.status === 403) return { ok: false, error: 'Token sans rôle admin.' }
      if (err.status === 404) return { ok: false, error: 'Réservation introuvable.' }
      if (err.status === 409) return { ok: false, error: 'Réservation déjà terminée (cancelled/returned/expired).' }
      return { ok: false, error: `API ${err.status}: ${err.detail}` }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' }
  }

  revalidatePath('/reservations')
  revalidateTag('reservations')
  revalidateTag(`reservation:${id}`)
  return { ok: true }
}

export type CsvResult =
  | { ok: true; csv: string; filename: string; source: 'live' | 'demo' }
  | { ok: false; error: string }

export async function exportReservationsCsvAction(
  filters: ReservationExportFilters,
): Promise<CsvResult> {
  // Filename qui reflète la fenêtre choisie (utile pour archivage côté commune).
  const todayIso = new Date().toISOString().slice(0, 10)
  const filename = filters.from && filters.to
    ? `reservations-${filters.from}_${filters.to}.csv`
    : filters.from
    ? `reservations-from-${filters.from}.csv`
    : filters.to
    ? `reservations-until-${filters.to}.csv`
    : `reservations-${todayIso}.csv`

  try {
    const csv = await fetchReservationsCsv(filters)
    return { ok: true, csv, filename, source: 'live' }
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Fallback démo — on génère un CSV à partir des fixtures pour que
      // l'utilisateur puisse au moins voir le format même sans token valide.
      const csv = demoCsv(filters)
      return { ok: true, csv, filename, source: 'demo' }
    }
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' }
  }
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function demoCsv(filters: ReservationExportFilters): string {
  const filtered = DEMO_RESERVATIONS.filter((r) => {
    if (filters.status && r.status !== filters.status) return false
    if (filters.distributorId && r.distributor.id !== filters.distributorId) return false
    if (filters.from && r.createdAt < `${filters.from}T00:00:00`) return false
    if (filters.to && r.createdAt > `${filters.to}T23:59:59.999Z`) return false
    return true
  })

  const header = [
    'id', 'created_at', 'status', 'user_email', 'user_name',
    'distributor_name', 'distributor_serial', 'item_type',
    'expires_at', 'opened_at', 'due_at', 'returned_at',
    'extension_count', 'cancellation_reason',
  ].join(',')

  const lines = [header]
  for (const r of filtered as Reservation[]) {
    lines.push([
      csvCell(r.id),
      csvCell(r.createdAt),
      csvCell(r.status as ReservationStatus),
      csvCell(r.user.email),
      csvCell(r.user.displayName),
      csvCell(r.distributor.name),
      csvCell(r.distributor.serialNumber),
      csvCell(r.item.typeName),
      csvCell(r.expiresAt),
      csvCell(r.openedAt),
      csvCell(r.dueAt),
      csvCell(r.returnedAt),
      csvCell(r.extensionCount),
      csvCell(null), // cancellationReason pas dans le DTO
    ].join(','))
  }

  return '﻿' + lines.join('\r\n')
}
