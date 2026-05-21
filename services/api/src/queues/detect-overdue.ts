import { and, eq, lt } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { reservations } from '../db/schema.js'

/**
 * Marque `overdue` toute réservation active dont `due_at` est dépassé.
 *
 * Idempotence : le WHERE status = 'active' fait que les lignes déjà passées
 * en 'overdue' ne sont plus matchées au run suivant. Deux exécutions
 * simultanées sont également sûres (UPDATE atomique, statut transitionne
 * une seule fois).
 *
 * Retourne le nombre de réservations passées en overdue (utile pour tests
 * et observabilité).
 */
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
    .returning({ id: reservations.id, userId: reservations.userId })

  if (overdue.length > 0) log.warn({ count: overdue.length }, 'overdue reservations detected')
  // TODO: enqueue push notifications + décrément trust_score
  return overdue.length
}
