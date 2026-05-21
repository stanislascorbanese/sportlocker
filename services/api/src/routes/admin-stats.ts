import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { requireAdminScope } from '../lib/commune-scope.js'

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
      tags: ['Admin — Stats'],
      summary: 'Comptage réservations par jour',
      description: 'Série temporelle des créations sur les `days` derniers jours, jours à zéro inclus '
        + '(`generate_series`). Tous statuts confondus (pending/active/returned/overdue/cancelled/expired).',
      security: [{ bearerAuth: [] }],
      querystring: DailyQuery,
      response: {
        200: z.object({ points: z.array(DailyPoint) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { days } = req.query
    const scopeCommune = auth.scope?.communeId ?? null

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
        AND (
          ${scopeCommune}::uuid IS NULL
          OR r.distributor_id IN (
            SELECT id FROM distributors WHERE commune_id = ${scopeCommune}::uuid
          )
        )
      GROUP BY ds.day
      ORDER BY ds.day ASC
    `)

    return { points: rows.map((r) => ({ date: r.date, count: r.count })) }
  })

  /**
   * GET /v1/admin/stats/dashboard?days=30 — agrégats pour la page Stats :
   * daily series, répartition par statut, top distributeurs, top item types,
   * heatmap jour-de-semaine × heure.
   *
   * Tout en parallèle (5 queries), 1 round-trip côté client.
   */
  app.get('/dashboard', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Stats'],
      summary: 'Agrégats KPI page Stats du dashboard',
      description: '5 queries en parallèle, 1 round-trip côté client :\n'
        + '- `daily` : série temporelle des créations (jours à zéro inclus)\n'
        + '- `byStatus` : répartition par statut (tous les 6 statuts renvoyés, même à 0)\n'
        + '- `topDistributors` : top 5 distributeurs par volume\n'
        + '- `topItemTypes` : top 5 types d\'objets empruntés\n'
        + '- `hourly` : heatmap jour-de-semaine × heure (dow=0=dimanche, 6=samedi)\n\n'
        + 'Admin scopé : agrégats restreints à sa commune. Super_admin : tout le parc.',
      security: [{ bearerAuth: [] }],
      querystring: z.object({
        days: z.coerce.number().int().min(7).max(180).default(30)
          .describe('Fenêtre d\'analyse en jours (7..180, défaut 30)'),
      }),
      response: {
        200: z.object({
          days: z.number().int(),
          daily: z.array(DailyPoint),
          byStatus: z.array(z.object({
            status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
            count: z.number().int().nonnegative(),
          })),
          topDistributors: z.array(z.object({
            id: z.string().uuid(),
            name: z.string(),
            serialNumber: z.string(),
            count: z.number().int().nonnegative(),
          })),
          topItemTypes: z.array(z.object({
            id: z.string().uuid(),
            name: z.string(),
            count: z.number().int().nonnegative(),
          })),
          hourly: z.array(z.object({
            dow: z.number().int().min(0).max(6),
            hour: z.number().int().min(0).max(23),
            count: z.number().int().nonnegative(),
          })),
        }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { days } = req.query
    const interval = sql.raw(`INTERVAL '${days} days'`)
    const scopeCommune = auth.scope?.communeId ?? null

    // Filtre commune appliqué uniformément via une CTE `scoped_reservations`.
    // Si scopeCommune est NULL (admin), la sous-requête prend tout.
    // Sinon, on JOIN distributors pour restreindre.

    const [dailyRows, statusRows, topDistRows, topItemRows, hourlyRows] = await Promise.all([
      db.execute<{ date: string; count: number }>(sql`
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
          AND (
            ${scopeCommune}::uuid IS NULL
            OR r.distributor_id IN (
              SELECT id FROM distributors WHERE commune_id = ${scopeCommune}::uuid
            )
          )
        GROUP BY ds.day
        ORDER BY ds.day ASC
      `),
      db.execute<{ status: string; count: number }>(sql`
        SELECT r.status::text AS status, COUNT(*)::int AS count
        FROM reservations r
        WHERE r.created_at >= NOW() - ${interval}
          AND (
            ${scopeCommune}::uuid IS NULL
            OR r.distributor_id IN (
              SELECT id FROM distributors WHERE commune_id = ${scopeCommune}::uuid
            )
          )
        GROUP BY r.status
      `),
      db.execute<{ id: string; name: string; serial_number: string; count: number }>(sql`
        SELECT d.id, d.name, d.serial_number, COUNT(r.id)::int AS count
        FROM distributors d
        LEFT JOIN reservations r
          ON r.distributor_id = d.id
          AND r.created_at >= NOW() - ${interval}
        WHERE ${scopeCommune}::uuid IS NULL OR d.commune_id = ${scopeCommune}::uuid
        GROUP BY d.id, d.name, d.serial_number
        ORDER BY count DESC, d.name ASC
        LIMIT 5
      `),
      db.execute<{ id: string; name: string; count: number }>(sql`
        SELECT it.id, it.name, COUNT(r.id)::int AS count
        FROM item_types it
        LEFT JOIN items i ON i.item_type_id = it.id
        LEFT JOIN reservations r
          ON r.item_id = i.id
          AND r.created_at >= NOW() - ${interval}
          AND (
            ${scopeCommune}::uuid IS NULL
            OR r.distributor_id IN (
              SELECT id FROM distributors WHERE commune_id = ${scopeCommune}::uuid
            )
          )
        GROUP BY it.id, it.name
        ORDER BY count DESC, it.name ASC
        LIMIT 5
      `),
      db.execute<{ dow: number; hour: number; count: number }>(sql`
        SELECT
          EXTRACT(DOW FROM r.created_at)::int AS dow,
          EXTRACT(HOUR FROM r.created_at)::int AS hour,
          COUNT(*)::int AS count
        FROM reservations r
        WHERE r.created_at >= NOW() - ${interval}
          AND (
            ${scopeCommune}::uuid IS NULL
            OR r.distributor_id IN (
              SELECT id FROM distributors WHERE commune_id = ${scopeCommune}::uuid
            )
          )
        GROUP BY dow, hour
      `),
    ])

    const ALL_STATUSES = ['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'] as const
    const byStatusMap = new Map(statusRows.map((r) => [r.status, r.count]))
    const byStatus = ALL_STATUSES.map((status) => ({
      status,
      count: byStatusMap.get(status) ?? 0,
    }))

    return {
      days,
      daily: dailyRows.map((r) => ({ date: r.date, count: r.count })),
      byStatus,
      topDistributors: topDistRows.map((r) => ({
        id: r.id, name: r.name, serialNumber: r.serial_number, count: r.count,
      })),
      topItemTypes: topItemRows.map((r) => ({ id: r.id, name: r.name, count: r.count })),
      hourly: hourlyRows.map((r) => ({ dow: r.dow, hour: r.hour, count: r.count })),
    }
  })
}
