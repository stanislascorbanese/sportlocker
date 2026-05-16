import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'

const DailyQuery = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
})

const DailyPoint = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
})

const ErrorDTO = z.object({ error: z.string() })

export async function adminStatsRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/stats/reservations-daily — count des créations par jour
   * sur les `days` derniers jours. Inclut les jours à 0 (generate_series).
   * Tous statuts confondus (incluant cancelled/expired).
   */
  app.get('/reservations-daily', {
    onRequest: [app.authenticate],
    schema: {
      querystring: DailyQuery,
      response: {
        200: z.object({ points: z.array(DailyPoint) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden_admin_required' })
    }

    const { days } = req.query

    const rows = await db.execute<{ date: string; count: number }>(sql`
      WITH date_series AS (
        SELECT generate_series(
          (CURRENT_DATE - (${days - 1}::int * INTERVAL '1 day'))::date,
          CURRENT_DATE,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT
        to_char(ds.day, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(r.id), 0)::int AS count
      FROM date_series ds
      LEFT JOIN reservations r
        ON r.created_at >= ds.day
        AND r.created_at < ds.day + INTERVAL '1 day'
      GROUP BY ds.day
      ORDER BY ds.day ASC
    `)

    return { points: rows.map((r) => ({ date: r.date, count: r.count })) }
  })
}
