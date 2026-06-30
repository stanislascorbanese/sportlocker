import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, notificationLogs, reservations, users,
} from '../db/schema.js'
import { notifyUserPush } from '../lib/push-notify.js'

/**
 * Cron : envoie un rappel push **avant** chaque créneau réservé en statut
 * `scheduled`. Délai paramétrable par user (cf. PR 0011) :
 * `users.reminder_minutes_before` (15 par défaut, valeurs UI 15/30/60/120).
 *
 * Tourne toutes les 15 min. Fenêtre cible :
 * `slot_start_at - reminder_minutes_before ∈ [now - 8 min, now + 8 min]`
 *
 * Soit, par construction du JOIN :
 *   slot_start_at ∈ [now + reminder - 8min, now + reminder + 8min]
 *
 * Le filtre est fait côté SQL avec une fenêtre exprimée en intervalle relatif
 * au user, ce qui permet aux users qui veulent 15min comme à ceux qui veulent
 * 2h d'être servis par le même cron toutes les 15 min.
 *
 * Idempotent via `notification_logs` (template `slot_reminder:<resId>`).
 */
const REMINDER_TEMPLATE_PREFIX = 'slot_reminder'
const WINDOW_TOLERANCE_MIN = 8  // ±8 min autour de la cible (cron tourne 15 min)

type CandidateRow = {
  reservationId: string
  userId: string
  slotStartAt: Date
  reminderMinutesBefore: number
  distributorName: string
  itemTypeName: string
}

export async function runSlotReminders(log: FastifyBaseLogger): Promise<{
  scanned: number
  sent: number
  skipped: number
  revoked: number
  failed: number
}> {
  const now = new Date()
  // postgres-js ne sérialise pas un objet `Date` interpolé dans un template
  // `sql` (il le passe brut au driver → ERR_INVALID_ARG_TYPE). On bind donc
  // l'ISO string avec un cast explicite `::timestamptz`. Même contrainte que
  // dans expire-reservations (qui contourne en pré-calculant les cutoffs).
  const nowIso = now.toISOString()

  // Critère SQL : slot_start_at - users.reminder_minutes_before * INTERVAL '1 minute'
  // doit tomber dans [now - TOLERANCE, now + TOLERANCE].
  //
  // On exprime ça via : now + reminder ∈ [slot - TOL, slot + TOL]
  // Soit l'autre côté : slot - now ∈ [reminder - TOL, reminder + TOL]
  // En SQL: EXTRACT(EPOCH FROM (slot_start_at - now)) / 60 ∈ [reminder - TOL, reminder + TOL]
  const candidates = await db
    .select({
      reservationId: reservations.id,
      userId: reservations.userId,
      slotStartAt: reservations.slotStartAt,
      reminderMinutesBefore: users.reminderMinutesBefore,
      distributorName: distributors.name,
      itemTypeName: itemTypes.name,
    })
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
    .innerJoin(items, eq(items.id, reservations.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(and(
      eq(reservations.status, 'scheduled'),
      isNotNull(reservations.slotStartAt),
      // delta_min = (slot_start_at - now) en minutes
      // condition : ABS(delta_min - reminder) <= TOLERANCE
      sql`ABS(EXTRACT(EPOCH FROM (${reservations.slotStartAt} - ${nowIso}::timestamptz)) / 60.0 - ${users.reminderMinutesBefore}) <= ${WINDOW_TOLERANCE_MIN}`,
    ))

  let sent = 0
  let skipped = 0
  let revoked = 0
  let failed = 0

  for (const row of candidates as CandidateRow[]) {
    // Anti-doublon : 1 row notification_logs par résa identifiée par
    // template = "slot_reminder:<resId>". L'unicité est logique (pas
    // d'index UNIQUE en DB — sur 1 row/résa max c'est négligeable).
    const templateWithId = `${REMINDER_TEMPLATE_PREFIX}:${row.reservationId}`
    const existing = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(and(
        eq(notificationLogs.template, templateWithId),
        eq(notificationLogs.channel, 'push'),
      ))
      .limit(1)
    if (existing.length > 0) {
      skipped++
      continue
    }

    const slotHour = row.slotStartAt.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    })
    const minutesLabel = formatMinutesLabel(row.reminderMinutesBefore)
    const outcome = await notifyUserPush(row.userId, {
      title: `Ton créneau arrive dans ${minutesLabel} 🏐`,
      body: `${row.itemTypeName} à ${slotHour} · ${row.distributorName}.`,
      url: `/reservations/${row.reservationId}`,
      tag: `slot-${row.reservationId}`,
    }, log)
    revoked += outcome.revoked
    failed += outcome.failed

    if (outcome.notConfigured) {
      // VAPID absent : inutile d'itérer sur les résas suivantes.
      log.warn('slot_reminders_no_vapid')
      return { scanned: candidates.length, sent, skipped, revoked, failed }
    }
    // Pas de push enregistré = le user n'a pas activé les notifs → skip
    // (on ne pénalise pas).
    if (outcome.attempted === 0) {
      skipped++
      continue
    }

    if (outcome.sent) {
      sent++
      await db.insert(notificationLogs).values({
        userId: row.userId,
        channel: 'push',
        template: templateWithId,
        payload: {
          reservationId: row.reservationId,
          slotStartAt: row.slotStartAt.toISOString(),
          reminderMinutesBefore: row.reminderMinutesBefore,
        },
        deliveredAt: new Date(),
      })
    }
  }

  if (candidates.length > 0) {
    log.info({ scanned: candidates.length, sent, skipped, revoked, failed }, 'slot_reminders_run')
  }
  return { scanned: candidates.length, sent, skipped, revoked, failed }
}

function formatMinutesLabel(min: number): string {
  if (min < 60) return `${min} min`
  if (min === 60) return '1 h'
  if (min < 1440) return `${Math.floor(min / 60)} h`
  return '24 h'
}
