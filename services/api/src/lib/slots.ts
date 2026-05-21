/**
 * Helpers métier pour le modèle de réservation par slots
 * (cf. migration 0008 et docs/CDC.md §4.3).
 *
 * Granularité fixe : **30 minutes**. Tout `slot_start_at` doit tomber sur
 * `:00` ou `:30` en UTC (l'API stocke en TIMESTAMPTZ, donc on s'aligne sur
 * UTC pour éviter les surprises DST).
 *
 * Plage de booking : J → J+`MAX_BOOKING_HORIZON_DAYS`. Au-delà, refus 422.
 *
 * Durées autorisées : 30, 60, 90, 120 minutes (validées par le CHECK SQL et
 * le z.literal côté types partagés). Toute autre valeur est rejetée ici en
 * première ligne pour donner une erreur explicite plutôt qu'un 500 PG.
 */

const SLOT_GRANULARITY_MINUTES = 30
const ALLOWED_DURATIONS = [30, 60, 90, 120] as const

export const MAX_BOOKING_HORIZON_DAYS = 7

/**
 * Fenêtre de "grâce" après `slot_start_at` pendant laquelle un user peut
 * encore venir scanner son QR pour activer la réservation. Au-delà, le
 * cron BullMQ la passe à `expired` et libère le créneau pour d'autres.
 *
 * Décision produit (cf. conversation 2026-05-21) : 15 min.
 */
export const NO_SHOW_GRACE_MINUTES = 15

/**
 * Heures d'ouverture proposées par défaut côté MVP. Hardcoded ici : on n'a
 * pas (encore) de champ `opening_hours` par distributeur côté DB. À sortir
 * en colonne sur `distributors` quand on aura un cas réel (camping fermé
 * la nuit, école accessible 24/7, etc.).
 */
export const DEFAULT_OPENING_HOUR_UTC = 6   // 06:00 UTC ≈ 07:00 CET / 08:00 CEST
export const DEFAULT_CLOSING_HOUR_UTC = 21  // 21:00 UTC ≈ 22:00 CET / 23:00 CEST

export type SlotDurationMinutes = (typeof ALLOWED_DURATIONS)[number]

export function isAllowedDuration(n: number): n is SlotDurationMinutes {
  return (ALLOWED_DURATIONS as readonly number[]).includes(n)
}

/**
 * Vérifie qu'un instant tombe pile sur :00 ou :30 (granularité 30 min) en
 * UTC, sans seconde résiduelle.
 */
export function isAlignedToSlotGrid(d: Date): boolean {
  if (d.getUTCSeconds() !== 0 || d.getUTCMilliseconds() !== 0) return false
  const m = d.getUTCMinutes()
  return m === 0 || m === SLOT_GRANULARITY_MINUTES
}

/**
 * Validation complète d'un slot demandé par un client.
 *
 * Retourne `null` si OK, sinon une chaîne d'erreur stable (utilisée comme
 * `error` dans les 422 de la route — l'app web/mobile mappe vers un message
 * i18n).
 */
export type SlotValidationError =
  | 'slot_not_aligned'
  | 'slot_in_past'
  | 'slot_too_far'
  | 'slot_outside_opening_hours'
  | 'duration_not_allowed'

export function validateSlotRequest(args: {
  slotStartAt: Date
  durationMinutes: number
  now?: Date
}): SlotValidationError | null {
  const now = args.now ?? new Date()

  if (!isAllowedDuration(args.durationMinutes)) return 'duration_not_allowed'
  if (!isAlignedToSlotGrid(args.slotStartAt)) return 'slot_not_aligned'

  if (args.slotStartAt.getTime() <= now.getTime()) return 'slot_in_past'

  const horizon = new Date(now.getTime() + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  if (args.slotStartAt.getTime() > horizon.getTime()) return 'slot_too_far'

  const endAt = computeSlotEnd(args.slotStartAt, args.durationMinutes)
  const startHour = args.slotStartAt.getUTCHours()
  // Le slot doit *commencer ET finir* dans la plage d'ouverture. Comme la
  // fin est exclusive (endAt = startAt + duration), un slot de 21:30-22:00
  // est OK si DEFAULT_CLOSING_HOUR_UTC = 22, mais pas si =21.
  const endHourFloat =
    endAt.getUTCHours() + endAt.getUTCMinutes() / 60
  if (startHour < DEFAULT_OPENING_HOUR_UTC || endHourFloat > DEFAULT_CLOSING_HOUR_UTC) {
    return 'slot_outside_opening_hours'
  }

  return null
}

export function computeSlotEnd(startAt: Date, durationMinutes: number): Date {
  return new Date(startAt.getTime() + durationMinutes * 60 * 1000)
}

/**
 * Génère la liste de tous les `slot_start_at` candidats pour une plage
 * `[fromDay, toDay]` (inclusive côté `from`, exclusive côté `to+1` jour),
 * en respectant les heures d'ouverture et la granularité 30 min.
 *
 * Utilisé par la route `GET /v1/distributors/:id/availability` pour
 * énumérer les slots avant de filtrer par dispo et tarif.
 *
 * `from` et `to` sont des dates UTC tronquées au début de la journée
 * (mais la fonction ne tronque PAS, elle prend ce qu'on lui donne).
 */
export function enumerateSlotStarts(args: {
  fromDayUtc: Date
  toDayUtcInclusive: Date
  durationMinutes: number
}): Date[] {
  const starts: Date[] = []
  const oneSlotMs = SLOT_GRANULARITY_MINUTES * 60 * 1000
  const dayMs = 24 * 60 * 60 * 1000
  const lastDayStart = args.toDayUtcInclusive.getTime()

  for (let dayStart = args.fromDayUtc.getTime(); dayStart <= lastDayStart; dayStart += dayMs) {
    const openMs = dayStart + DEFAULT_OPENING_HOUR_UTC * 60 * 60 * 1000
    const closeMs = dayStart + DEFAULT_CLOSING_HOUR_UTC * 60 * 60 * 1000
    for (let t = openMs; t + args.durationMinutes * 60 * 1000 <= closeMs; t += oneSlotMs) {
      starts.push(new Date(t))
    }
  }
  return starts
}

/**
 * ISO YYYY-MM-DD du jour UTC (pour grouper la réponse availability).
 * On garde UTC en sortie API ; côté UI on convertira à Europe/Paris pour
 * affichage. (Évite de mélanger fuseaux dans le DTO réseau.)
 */
export function isoUtcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}
