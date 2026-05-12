import { and, eq, lt } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { lockers, reservations } from '../db/schema.js'

/**
 * Libère les casiers dont la réservation est en `pending` mais a dépassé
 * `expires_at` sans avoir été ouverte. Casier → idle, réservation → expired.
 */
export async function runExpireReservations(log: FastifyBaseLogger): Promise<void> {
  const now = new Date()

  const expired = await db
    .update(reservations)
    .set({ status: 'expired', updatedAt: now })
    .where(and(eq(reservations.status, 'pending'), lt(reservations.expiresAt, now)))
    .returning({ id: reservations.id, lockerId: reservations.lockerId })

  for (const r of expired) {
    await db
      .update(lockers)
      .set({ state: 'idle', lastStateAt: now, updatedAt: now })
      .where(eq(lockers.id, r.lockerId))
  }

  if (expired.length > 0) log.info({ count: expired.length }, 'expired reservations released')
}
