import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors } from '../db/schema.js'
import { requireAdminOrOperator } from '../lib/commune-scope.js'

/**
 * Module "Parc & maintenance 4.0" — santé télémétrique d'un distributeur.
 *
 * Exploite `distributor_heartbeats` (rétention 30j) que le firmware pousse
 * via MQTT : rssi, température CPU, mémoire libre, uptime. Jusqu'ici cette
 * donnée était collectée mais jamais affichée côté ops.
 */

const HealthQuery = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
})

const HealthLatest = z.object({
  receivedAt: z.string().datetime(),
  rssiDbm: z.number().int().nullable(),
  cpuTempC: z.number().nullable(),
  uptimeSeconds: z.number().int().nullable(),
  freeMemMb: z.number().int().nullable(),
}).nullable()

const HealthPoint = z.object({
  bucket: z.string().datetime(),
  avgCpuTempC: z.number().nullable(),
  avgRssiDbm: z.number().nullable(),
  avgFreeMemMb: z.number().nullable(),
  count: z.number().int(),
})

const DistributorHealthDTO = z.object({
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
    status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
    firmwareVersion: z.string().nullable(),
    lastSeenAt: z.string().datetime().nullable(),
  }),
  summary: z.object({
    windowHours: z.number().int(),
    heartbeatCount: z.number().int(),
    /** % de tranches de 5 min de la fenêtre contenant ≥ 1 heartbeat. */
    availabilityPct: z.number().min(0).max(100).nullable(),
    avgCpuTempC: z.number().nullable(),
    maxCpuTempC: z.number().nullable(),
    avgRssiDbm: z.number().nullable(),
    minFreeMemMb: z.number().int().nullable(),
  }),
  latest: HealthLatest,
  series: z.array(HealthPoint),
})

const ErrorDTO = z.object({ error: z.string() })

type SummaryRow = {
  heartbeat_count: number
  avg_cpu: number | null
  max_cpu: number | null
  avg_rssi: number | null
  min_free_mem: number | null
  active_buckets: number
}

type LatestRow = {
  // postgres-js (config main) renvoie les timestamps en string, pas en Date.
  received_at: Date | string
  rssi_dbm: number | null
  cpu_temp_c: number | null
  uptime_seconds: number | null
  free_mem_mb: number | null
}

type SeriesRow = {
  bucket: Date | string
  avg_cpu: number | null
  avg_rssi: number | null
  avg_free_mem: number | null
  count: number
}

export async function adminDistributorHealthRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/distributors/:id/health — santé télémétrique sur les
   * `hours` dernières heures (défaut 24, max 168).
   *
   * Scopé : un operator ne voit que les distributeurs de sa commune (404
   * sinon, cohérent avec /admin/maintenance-tickets/:id).
   */
  app.get('/:id/health', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      querystring: HealthQuery,
      response: {
        200: DistributorHealthDTO,
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminOrOperator(req, reply)
    if (!auth.ok) return

    const { id } = req.params
    const { hours } = req.query

    const conditions = [eq(distributors.id, id)]
    if (auth.scope) conditions.push(eq(distributors.communeId, auth.scope.communeId))

    const [dist] = await db
      .select({
        id: distributors.id,
        name: distributors.name,
        serialNumber: distributors.serialNumber,
        status: distributors.status,
        firmwareVersion: distributors.firmwareVersion,
        lastSeenAt: distributors.lastSeenAt,
      })
      .from(distributors)
      .where(and(...conditions))
      .limit(1)

    if (!dist) return reply.code(404).send({ error: 'distributor_not_found' })

    const summaryRows = await db.execute<SummaryRow>(sql`
      SELECT
        COUNT(*)::int                                              AS heartbeat_count,
        AVG(cpu_temp_c)::float8                                    AS avg_cpu,
        MAX(cpu_temp_c)::float8                                    AS max_cpu,
        AVG(rssi_dbm)::float8                                      AS avg_rssi,
        MIN(free_mem_mb)::int                                      AS min_free_mem,
        COUNT(DISTINCT FLOOR(EXTRACT(EPOCH FROM received_at) / 300))::int AS active_buckets
      FROM distributor_heartbeats
      WHERE distributor_id = ${id}
        AND received_at >= now() - make_interval(hours => ${hours})
    `)
    const s = summaryRows[0] as SummaryRow | undefined

    const latestRows = await db.execute<LatestRow>(sql`
      SELECT received_at, rssi_dbm, cpu_temp_c::float8 AS cpu_temp_c, uptime_seconds, free_mem_mb
      FROM distributor_heartbeats
      WHERE distributor_id = ${id}
      ORDER BY received_at DESC
      LIMIT 1
    `)
    const latestRow = latestRows[0] as LatestRow | undefined

    const seriesRows = await db.execute<SeriesRow>(sql`
      SELECT
        date_trunc('hour', received_at)  AS bucket,
        AVG(cpu_temp_c)::float8          AS avg_cpu,
        AVG(rssi_dbm)::float8            AS avg_rssi,
        AVG(free_mem_mb)::float8         AS avg_free_mem,
        COUNT(*)::int                    AS count
      FROM distributor_heartbeats
      WHERE distributor_id = ${id}
        AND received_at >= now() - make_interval(hours => ${hours})
      GROUP BY 1
      ORDER BY 1 ASC
    `)

    // Dispo : tranches de 5 min vues / tranches attendues sur la fenêtre.
    const expectedBuckets = hours * 12
    const activeBuckets = s?.active_buckets ?? 0
    const availabilityPct = (s?.heartbeat_count ?? 0) === 0
      ? null
      : Math.min(100, Math.round((activeBuckets / expectedBuckets) * 100))

    return {
      distributor: {
        id: dist.id,
        name: dist.name,
        serialNumber: dist.serialNumber,
        status: dist.status,
        firmwareVersion: dist.firmwareVersion,
        lastSeenAt: dist.lastSeenAt?.toISOString() ?? null,
      },
      summary: {
        windowHours: hours,
        heartbeatCount: s?.heartbeat_count ?? 0,
        availabilityPct,
        avgCpuTempC: s?.avg_cpu ?? null,
        maxCpuTempC: s?.max_cpu ?? null,
        avgRssiDbm: s?.avg_rssi ?? null,
        minFreeMemMb: s?.min_free_mem ?? null,
      },
      latest: latestRow
        ? {
            receivedAt: new Date(latestRow.received_at).toISOString(),
            rssiDbm: latestRow.rssi_dbm,
            cpuTempC: latestRow.cpu_temp_c,
            uptimeSeconds: latestRow.uptime_seconds,
            freeMemMb: latestRow.free_mem_mb,
          }
        : null,
      series: (seriesRows as unknown as SeriesRow[]).map((r) => ({
        bucket: new Date(r.bucket).toISOString(),
        avgCpuTempC: r.avg_cpu,
        avgRssiDbm: r.avg_rssi,
        avgFreeMemMb: r.avg_free_mem,
        count: r.count,
      })),
    }
  })
}
