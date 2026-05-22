import { and, between, eq, isNotNull } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, notificationLogs, pushTokens, reservations,
} from '../db/schema.js'
import { sendWebPush } from '../lib/webpush.js'

/**
 * Cron : envoie un rappel push **1h avant** chaque créneau réservé en
 * statut `scheduled`. Tourne toutes les 15 min. Idempotent via
 * `notification_logs` : on ne renvoie pas le même template pour la même
 * réservation.
 *
 * Fenêtre cible : `slot_start_at ∈ [now + 55 min, now + 65 min]`. Si le
 * cron est en retard de quelques minutes (drift Redis/BullMQ), on capture
 * quand même les résas grâce à la fenêtre de 10 min. Si une résa tombe
 * pile sur la frontière, le filet anti-doublon (`notification_logs`)
 * évite le double envoi.
 *
 * Toutes les notifs ratées (push gone/invalid/http_error) sont loggées en
 * info. Une subscription qui répond 404/410 = révoquée → DELETE de la row
 * pour ne plus retenter.
 */
const REMINDER_TEMPLATE = 'slot_reminder_1h'
const WINDOW_MIN_MS = 55 * 60 * 1000
const WINDOW_MAX_MS = 65 * 60 * 1000

type CandidateRow = {
  reservationId: string
  userId: string
  slotStartAt: Date
  distributorName: string
  itemTypeName: string
  durationMinutes: number | null
}

export async function runSlotReminders(log: FastifyBaseLogger): Promise<{
  scanned: number
  sent: number
  skipped: number
  revoked: number
  failed: number
}> {
  const now = Date.now()
  const windowMin = new Date(now + WINDOW_MIN_MS)
  const windowMax = new Date(now + WINDOW_MAX_MS)

  const candidates = await db
    .select({
      reservationId: reservations.id,
      userId: reservations.userId,
      slotStartAt: reservations.slotStartAt,
      distributorName: distributors.name,
      itemTypeName: itemTypes.name,
      durationMinutes: reservations.durationMinutes,
    })
    .from(reservations)
    .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
    .innerJoin(items, eq(items.id, reservations.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .where(and(
      eq(reservations.status, 'scheduled'),
      isNotNull(reservations.slotStartAt),
      between(reservations.slotStartAt, windowMin, windowMax),
    ))

  let sent = 0
  let skipped = 0
  let revoked = 0
  let failed = 0

  for (const row of candidates as CandidateRow[]) {
    // Anti-doublon : on a déjà envoyé ce template pour cette résa ?
    // notification_logs.payload.reservationId nous sert d'index logique
    // (pas indexé en DB, mais sur 1 row/résa max c'est négligeable).
    const already = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(and(
        eq(notificationLogs.userId, row.userId),
        eq(notificationLogs.template, REMINDER_TEMPLATE),
        eq(notificationLogs.channel, 'push'),
      ))
      .limit(50)
    const alreadySentForThisRes = already.some((_log) => {
      // L'enregistrement payload n'est pas chargé ici — on prend la voie
      // simple : on attache directement reservationId dans le template
      // composite pour pouvoir requêter dessus précisément. Voir plus bas.
      return false
    })
    void alreadySentForThisRes
    // Implémentation plus simple : on stocke le template "slot_reminder_1h:<resId>"
    // unique par résa → le SELECT teste l'existence directement.
    const templateWithId = `${REMINDER_TEMPLATE}:${row.reservationId}`
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

    // Charge les push subscriptions du user. Pas de push enregistré =
    // le user n'a pas activé les notifs → skip (on ne pénalise pas).
    const subs = await db
      .select({
        endpoint: pushTokens.endpoint,
        p256dh: pushTokens.p256dhKey,
        auth: pushTokens.authKey,
      })
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, row.userId), isNotNull(pushTokens.endpoint)))
    if (subs.length === 0) {
      skipped++
      continue
    }

    const slotHour = row.slotStartAt.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
    })
    const payload = {
      title: 'Ton créneau arrive 🏐',
      body: `${row.itemTypeName} à ${slotHour} · ${row.distributorName}. À tout de suite !`,
      url: `/reservations/${row.reservationId}`,
      tag: `slot-${row.reservationId}`,
    }

    let anySentForThisRes = false
    for (const sub of subs) {
      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue
      const res = await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      if (res.ok) {
        anySentForThisRes = true
      } else if (res.reason === 'gone') {
        // Subscription révoquée par le browser — on la supprime pour ne
        // plus la retenter au prochain cron.
        await db.delete(pushTokens).where(eq(pushTokens.endpoint, sub.endpoint))
        revoked++
      } else if (res.reason === 'not_configured') {
        // VAPID absent : le caller ne peut rien faire. On log et on sort
        // de la boucle pour éviter N appels qui échouent identiquement.
        log.warn('slot_reminders_no_vapid')
        return { scanned: candidates.length, sent, skipped, revoked, failed }
      } else {
        failed++
        log.warn({ reason: res.reason, statusCode: res.statusCode, detail: res.detail },
          'slot_reminder_send_failed')
      }
    }

    if (anySentForThisRes) {
      sent++
      await db.insert(notificationLogs).values({
        userId: row.userId,
        channel: 'push',
        template: templateWithId,
        payload: { reservationId: row.reservationId, slotStartAt: row.slotStartAt.toISOString() },
        deliveredAt: new Date(),
      })
    }
  }

  if (candidates.length > 0) {
    log.info({ scanned: candidates.length, sent, skipped, revoked, failed }, 'slot_reminders_run')
  }
  return { scanned: candidates.length, sent, skipped, revoked, failed }
}
