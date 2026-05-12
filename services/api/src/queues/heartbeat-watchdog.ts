import { and, eq, lt, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { distributors } from '../db/schema.js'

/**
 * Bascule en `offline` tout distributeur dont le dernier heartbeat date
 * de plus de 5 min. Source du badge "déconnecté" dans le dashboard.
 */
export async function runHeartbeatWatchdog(log: FastifyBaseLogger): Promise<void> {
  const threshold = sql<Date>`NOW() - INTERVAL '5 minutes'`

  const flipped = await db
    .update(distributors)
    .set({ status: 'offline', updatedAt: new Date() })
    .where(and(
      eq(distributors.status, 'online'),
      lt(distributors.lastSeenAt, threshold),
    ))
    .returning({ id: distributors.id, serialNumber: distributors.serialNumber })

  if (flipped.length > 0) log.warn({ count: flipped.length, ids: flipped.map((d) => d.id) }, 'distributors marked offline')
}
