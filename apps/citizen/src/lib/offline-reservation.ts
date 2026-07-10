'use client'

import { ReservationActive } from './api'

/**
 * Cache local du QR de la réservation active, pour l'afficher **hors-ligne**.
 *
 * Contexte terrain : le citoyen paie et voit son QR en ligne, puis arrive au
 * distributeur en zone blanche (camping, sous-sol de gymnase). Le service
 * worker bypasse tous les appels `/v1/*` (pas de cache API), donc sans ce
 * snapshot un cold-start hors-ligne n'afficherait aucun QR.
 *
 * Sécurité : on ne stocke QUE le `qrToken` déjà signé par l'API (JWT HS256).
 * Aucun secret de signature ne transite côté client — le firmware vérifie le
 * token hors-ligne avec `JWT_DEVICE_SECRET`, le token seul suffit au scan.
 *
 * Validité : le token de `GET /v1/reservations/active` porte un `exp` = fin de
 * la fenêtre de résa (`expiresAt`), pas 15 min glissantes. Un seul fetch en
 * ligne suffit donc à couvrir tout le créneau. On refuse d'afficher (et on
 * purge) un snapshot dont `expiresAt` est passé : le firmware le rejetterait.
 */

const STORAGE_KEY = 'sl-active-reservation'

/** Statuts qui portent un QR scannable qu'il vaut la peine de cacher. */
const CACHEABLE_STATUSES = new Set<ReservationActive['status']>([
  'scheduled',
  'pending',
  'active',
])

function isStillValid(r: ReservationActive): boolean {
  return Date.parse(r.expiresAt) > Date.now()
}

/**
 * Persiste la résa si elle porte un QR encore valide, sinon purge le cache.
 * Appelé après chaque fetch réussi en ligne : couvre le passage en état
 * terminal (`returned`/`cancelled`/`expired` → 404 → `null` ici → purge).
 */
export function persistOrClearOfflineReservation(r: ReservationActive | null): void {
  try {
    if (r && r.qrToken && CACHEABLE_STATUSES.has(r.status) && isStillValid(r)) {
      // On ne stocke jamais le marqueur transient `offline`.
      const { offline: _drop, ...snapshot } = r
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Safari private mode / quota dépassé — non critique, l'app reste online-first.
  }
}

/**
 * Lit le snapshot mis en cache s'il est encore valide. Revalide via le schéma
 * (un localStorage corrompu ou d'une ancienne version renvoie `null`) et purge
 * un token périmé.
 */
export function readOfflineReservation(): ReservationActive | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = ReservationActive.safeParse(JSON.parse(raw))
    if (!parsed.success) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    if (!isStillValid(parsed.data)) {
      window.localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

export function clearOfflineReservation(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
