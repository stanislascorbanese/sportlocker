import type { ReservationActive, ReservationHistoryItem } from '../../../lib/api'

/**
 * Logique pure de la page réservation, isolée du composant client pour être
 * testable sans monter tout l'arbre React (Stripe, qrcode, next/navigation…).
 */

/**
 * Cadence de rafraîchissement du GET /active selon l'état de la résa.
 *
 * - `pending_payment` : 3 s — après confirmation Stripe, le webhook bascule
 *   vite en `scheduled`, on veut afficher le QR sans délai.
 * - QR affiché : le `qrToken` renvoyé par /active est **re-signé à chaque
 *   fetch** (son `exp` reste borné à `expiresAt`). On resserre donc le polling à
 *   l'approche de l'expiration pour que le QR présenté à la borne soit toujours
 *   fraîchement signé plutôt que vieux de 30 s — l'équivalent, côté client, du
 *   « refresh avant expiration » : ~5 min avant on passe à 15 s, ~1 min avant à
 *   5 s. On ne prolonge jamais la validité (borne serveur), on la garde fraîche.
 */
export function qrRefetchInterval(
  data: Pick<ReservationActive, 'status' | 'expiresAt'> | null,
): number {
  if (!data) return 30_000
  if (data.status === 'pending_payment') return 3_000
  const remainingMs = new Date(data.expiresAt).getTime() - Date.now()
  if (remainingMs <= 0) return 30_000
  if (remainingMs < 60_000) return 5_000
  if (remainingMs < 5 * 60_000) return 15_000
  return 30_000
}

/**
 * Durée réelle de l'emprunt, en minutes. Priorité au temps effectif casier
 * (`openedAt → returnedAt`) ; à défaut, la durée du créneau réservé
 * (`durationMinutes`). `null` si aucune donnée exploitable (résa legacy).
 */
export function actualDurationMinutes(r: ReservationHistoryItem): number | null {
  if (r.openedAt && r.returnedAt) {
    const ms = new Date(r.returnedAt).getTime() - new Date(r.openedAt).getTime()
    if (ms >= 0) return Math.max(1, Math.round(ms / 60_000))
  }
  return r.durationMinutes ?? null
}

/**
 * Retour en retard : `returnedAt` postérieur à `dueAt`. Le cron `detect-overdue`
 * applique alors une pénalité sur le trust score (cf. CLAUDE.md). Le score chiffré
 * n'est pas exposé au client (frontend-only) — on signale juste la pénalité.
 */
export function returnedLate(r: ReservationHistoryItem): boolean {
  if (!r.returnedAt || !r.dueAt) return false
  return new Date(r.returnedAt).getTime() > new Date(r.dueAt).getTime()
}
