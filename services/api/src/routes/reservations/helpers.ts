/**
 * Constantes + helpers partagés par les sous-modules de réservations.
 *
 * Extraits de `routes/reservations.ts` (audit dette tech §2) pour permettre
 * aux sous-modules (`views.ts`, `dtos.ts`, et futurs `create.ts`/`pay.ts`/
 * `lifecycle.ts`) de partager ces primitives sans imports circulaires.
 */
import type { db } from '../../db/client.js'
import { reservations } from '../../db/schema.js'

// ─── Constantes métier ───────────────────────────────────────────────────────

/** TTL d'une réservation `pending` : passé ce délai, le cron expire-reservations la termine. */
export const RESERVATION_TTL_MS = 15 * 60 * 1000

/** TTL du JWT device intégré au QR code (15 min). */
export const DEVICE_TOKEN_TTL_SEC = 15 * 60

/** TTL du verrou Redis qui sérialise les POST concurrents sur le même locker. */
export const LOCK_TTL_SEC = 30

/** Nombre maximal de prolongations autorisées sur une réservation `active`. */
export const MAX_EXTENSIONS = 2

/** TTL du cache d'idempotence (Idempotency-Key) — 24h, aligné Stripe. */
export const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60

/** Longueur maximale acceptée pour un header `Idempotency-Key` (anti-DOS). */
export const IDEMPOTENCY_KEY_MAX_LEN = 255

/**
 * Fenêtre de blocage de l'annulation côté citoyen avant le début du slot.
 * Au-delà de ce délai, le créneau est considéré comme engagé (cf. CDC :
 * donne le temps au tenant de planifier le rechargement matériel et évite
 * les annulations "regret" juste avant arrivée).
 */
export const CANCEL_CUTOFF_MIN = 30

// ─── Types partagés ──────────────────────────────────────────────────────────

/** Handle de transaction Drizzle (paramètre de `db.transaction(async (tx) => …)`). */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Row brute Drizzle d'une réservation, telle que retournée par un SELECT direct. */
export type ReservationRow = typeof reservations.$inferSelect

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Lit et valide le header `Idempotency-Key`. Retourne la string trimmée si valide,
 * `null` sinon (header absent, vide, trop long, ou pas une string).
 *
 * Les routes qui mutent (POST/PATCH) utilisent ce helper en début de handler
 * pour court-circuiter la transaction métier si une réponse a déjà été émise
 * pour la même clé (déduplication des retries client).
 */
export function readIdempotencyKey(headers: Record<string, unknown>): string | null {
  const raw = headers['idempotency-key']
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.length > IDEMPOTENCY_KEY_MAX_LEN) return null
  return trimmed
}

/**
 * Convertit une row Drizzle en payload DTO `ReservationBaseDTO` (ou similaire).
 * Centralise le mapping snake_case (DB) → camelCase ISO (API) + la sérialisation
 * des Dates en ISO 8601.
 */
export function toDto(r: ReservationRow) {
  return {
    id: r.id,
    status: r.status,
    lockerId: r.lockerId,
    itemId: r.itemId,
    distributorId: r.distributorId,
    expiresAt: r.expiresAt.toISOString(),
    dueAt: r.dueAt?.toISOString() ?? null,
    extensionCount: r.extensionCount,
  }
}
