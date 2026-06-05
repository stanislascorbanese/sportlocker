import { and, eq, inArray, lt } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { distributors, itemTypes, items, notificationLogs, reservations } from '../db/schema.js'
import { notifyUserPush } from '../lib/push-notify.js'

/**
 * Marque `overdue` toute réservation active dont `due_at` est dépassé, puis
 * envoie un rappel push au user concerné.
 *
 * Idempotence : le WHERE status = 'active' fait que les lignes déjà passées
 * en 'overdue' ne sont plus matchées au run suivant. Deux exécutions
 * simultanées sont également sûres (UPDATE atomique, statut transitionne
 * une seule fois). **Corollaire** : chaque résa n'est retournée qu'**une
 * seule fois** par l'UPDATE → exactement une tentative de notification, pas
 * besoin de dédoublonner via `notification_logs` (au contraire de
 * slot-reminders dont le SELECT peut re-matcher la même row entre deux runs).
 *
 * Le push est best-effort : un échec transitoire n'est pas retenté (la résa
 * est déjà 'overdue', elle ne repassera plus dans le cron). On logge l'échec.
 *
 * Retourne le nombre de réservations passées en overdue (utile pour tests
 * et observabilité). Le compteur de notifications est loggé, pas retourné,
 * pour préserver la signature consommée ailleurs.
 */
const OVERDUE_TEMPLATE_PREFIX = 'overdue_reminder'

export async function runDetectOverdue(log: FastifyBaseLogger): Promise<number> {
  const now = new Date()

  // Rows avec `due_at IS NULL` (pas encore ouvertes ⇒ pas encore actives,
  // en théorie filtré par status='active') restent ignorées : lt(null, now)
  // = NULL = falsy côté SQL, donc le WHERE les exclut naturellement.
  const overdue = await db
    .update(reservations)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(
      eq(reservations.status, 'active'),
      lt(reservations.dueAt, now),
    ))
    .returning({
      id: reservations.id,
      userId: reservations.userId,
      dueAt: reservations.dueAt,
    })

  if (overdue.length === 0) return 0

  log.warn({ count: overdue.length }, 'overdue reservations detected')

  // Détails d'affichage (nom de l'item_type + du distributeur) pour le corps
  // du push. Un seul SELECT joint sur les ids fraîchement passés overdue —
  // les inner joins sont sûrs (item_id / distributor_id sont NOT NULL).
  const details = await db
    .select({
      reservationId: reservations.id,
      itemTypeName: itemTypes.name,
      distributorName: distributors.name,
    })
    .from(reservations)
    .innerJoin(items, eq(items.id, reservations.itemId))
    .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
    .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
    .where(inArray(reservations.id, overdue.map((r) => r.id)))
  const detailById = new Map(details.map((d) => [d.reservationId, d]))

  let notified = 0
  for (const row of overdue) {
    const d = detailById.get(row.id)
    const itemLabel = d?.itemTypeName ?? 'ton matériel'
    const place = d?.distributorName ? ` à ${d.distributorName}` : ''
    const outcome = await notifyUserPush(row.userId, {
      title: 'Ton emprunt est en retard ⏰',
      body: `Pense à rendre ${itemLabel}${place} pour libérer le casier.`,
      url: `/reservations/${row.id}`,
      tag: `overdue-${row.id}`,
    }, log)

    if (outcome.notConfigured) {
      // VAPID absent : inutile d'itérer sur les résas suivantes.
      log.warn('overdue_reminders_no_vapid')
      break
    }

    if (outcome.sent) {
      notified++
      await db.insert(notificationLogs).values({
        userId: row.userId,
        channel: 'push',
        template: `${OVERDUE_TEMPLATE_PREFIX}:${row.id}`,
        payload: {
          reservationId: row.id,
          dueAt: row.dueAt ? row.dueAt.toISOString() : null,
        },
        deliveredAt: now,
      })
    }
  }

  if (notified > 0) log.info({ count: overdue.length, notified }, 'overdue reminders sent')
  // TODO: décrément trust_score des users en retard (gamification — hors scope push)
  return overdue.length
}
