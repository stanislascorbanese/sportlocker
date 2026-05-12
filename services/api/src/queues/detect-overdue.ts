import { and, eq, lt, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { reservations } from '../db/schema.js'

/**
 * Marque `overdue` toute réservation active depuis plus de 24 h sans retour.
 * Déclenche un envoi push (TODO) et met à jour le trust_score utilisateur.
 *
 * TODO(extension) : la migration 0002 a ajouté `reservations.due_at`. Ce cron
 * utilise toujours `opened_at + 24h` en dur ; il faut basculer sur `due_at`
 * pour que les prolongations (PATCH /reservations/:id/extend) reportent
 * réellement le marquage overdue. Voir docs/ARCHITECTURE.md §Crons.
 */
export async function runDetectOverdue(log: FastifyBaseLogger): Promise<void> {
  const threshold = sql<Date>`NOW() - INTERVAL '24 hours'`

  const overdue = await db
    .update(reservations)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(and(
      eq(reservations.status, 'active'),
      lt(reservations.openedAt, threshold),
    ))
    .returning({ id: reservations.id, userId: reservations.userId })

  if (overdue.length > 0) log.warn({ count: overdue.length }, 'overdue reservations detected')
  // TODO: enqueue push notifications + décrément trust_score
}
