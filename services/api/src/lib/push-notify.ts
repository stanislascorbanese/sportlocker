/**
 * Helper d'envoi Web Push à **toutes les subscriptions d'un user**.
 *
 * Factorise la boucle commune aux crons (slot-reminders, detect-overdue, …) :
 *   - charge les subscriptions actives (`endpoint IS NOT NULL`) du user ;
 *   - envoie le payload à chacune via `sendWebPush` ;
 *   - supprime les subscriptions révoquées (HTTP 404/410 → `gone`) pour ne
 *     plus les retenter au prochain run ;
 *   - signale `notConfigured` si VAPID est absent, pour que le caller arrête
 *     d'itérer (inutile d'insister sur les users suivants).
 *
 * **Ne touche pas `notification_logs`** : la traçabilité et l'idempotence sont
 * de la responsabilité du caller, car le `template` (et donc la clé d'unicité)
 * dépend du contexte métier.
 */
import { and, eq, isNotNull } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { pushTokens } from '../db/schema.js'
import { sendWebPush, type PushPayload } from './webpush.js'

export type NotifyOutcome = {
  /** Au moins une subscription a accusé réception du push. */
  sent: boolean
  /** Nombre de subscriptions révoquées (gone) supprimées en DB. */
  revoked: number
  /** Nombre d'envois en échec (hors révocation). */
  failed: number
  /** VAPID non configuré : le caller devrait arrêter d'itérer sur d'autres users. */
  notConfigured: boolean
}

export async function notifyUserPush(
  userId: string,
  payload: PushPayload,
  log: FastifyBaseLogger,
): Promise<NotifyOutcome> {
  const subs = await db
    .select({
      endpoint: pushTokens.endpoint,
      p256dh: pushTokens.p256dhKey,
      auth: pushTokens.authKey,
    })
    .from(pushTokens)
    .where(and(eq(pushTokens.userId, userId), isNotNull(pushTokens.endpoint)))

  let sent = false
  let revoked = 0
  let failed = 0

  for (const sub of subs) {
    if (!sub.endpoint || !sub.p256dh || !sub.auth) continue
    const res = await sendWebPush(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
    )
    if (res.ok) {
      sent = true
    } else if (res.reason === 'gone') {
      // Subscription révoquée côté browser — on la supprime pour ne plus la
      // retenter. (endpoint est unique → cible une seule row.)
      await db.delete(pushTokens).where(eq(pushTokens.endpoint, sub.endpoint))
      revoked++
    } else if (res.reason === 'not_configured') {
      // VAPID absent : le caller ne peut rien y faire, on remonte le signal
      // pour qu'il arrête la boucle au lieu d'enchaîner N échecs identiques.
      return { sent, revoked, failed, notConfigured: true }
    } else {
      failed++
      log.warn({ reason: res.reason, statusCode: res.statusCode, detail: res.detail },
        'push_send_failed')
    }
  }

  return { sent, revoked, failed, notConfigured: false }
}
