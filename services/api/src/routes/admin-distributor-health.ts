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

/**
 * Vue agrégée multi-distributeurs : un par ligne avec les métriques clés et
 * une liste d'alertes pré-calculée. Conçu pour la page /health du dashboard
 * (vue parc) — pas pour le détail d'un seul distributeur.
 */
const FleetAlert = z.enum([
  'offline',           // status = offline
  'no_heartbeat_24h',  // aucun heartbeat reçu depuis 24h (ou jamais)
  'high_cpu_temp',     // dernière température CPU > 75°C
  'weak_signal',       // dernier RSSI < -80 dBm
  'low_memory',        // dernière mémoire libre < 64 Mo
  'open_critical',     // ≥ 1 ticket maintenance ouvert sévérité ≥ 4
])
type FleetAlert = z.infer<typeof FleetAlert>

const FleetHealthRow = z.object({
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
    status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
    communeName: z.string().nullable(),
    firmwareVersion: z.string().nullable(),
    lastSeenAt: z.string().datetime().nullable(),
  }),
  latest: z.object({
    receivedAt: z.string().datetime().nullable(),
    cpuTempC: z.number().nullable(),
    rssiDbm: z.number().int().nullable(),
    freeMemMb: z.number().int().nullable(),
    uptimeSeconds: z.number().int().nullable(),
  }),
  openTickets: z.number().int(),
  criticalTickets: z.number().int(),
  alerts: z.array(FleetAlert),
})

const FleetHealthDTO = z.object({
  generatedAt: z.string().datetime(),
  total: z.number().int(),
  withAlerts: z.number().int(),
  rows: z.array(FleetHealthRow),
})

type FleetRowRaw = {
  id: string
  name: string
  serial_number: string
  status: 'online' | 'offline' | 'maintenance' | 'decommissioned'
  commune_name: string | null
  firmware_version: string | null
  last_seen_at: Date | string | null
  received_at: Date | string | null
  cpu_temp_c: number | null
  rssi_dbm: number | null
  free_mem_mb: number | null
  uptime_seconds: number | null
  open_tickets: number
  critical_tickets: number
}

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

  /**
   * GET /v1/admin/distributors/fleet-health — vue agrégée multi-distributeurs.
   *
   * Pour chaque distributeur scopé (operator → sa commune, super_admin →
   * tout le parc), retourne :
   *   - identité (id, name, serial, commune, status, firmware, lastSeen)
   *   - dernière mesure télémétrique (heartbeat le plus récent)
   *   - compteurs tickets maintenance (ouverts + critiques sévérité ≥ 4)
   *   - alertes pré-calculées via seuils :
   *       offline, no_heartbeat_24h, high_cpu_temp (>75°C),
   *       weak_signal (<-80dBm), low_memory (<64Mo), open_critical
   *
   * Une seule requête SQL avec LATERAL JOIN — pas de N+1 par distributeur.
   * Rangé par nombre d'alertes décroissant pour faire remonter ce qui
   * réclame de l'attention.
   */
  app.get('/fleet-health', {
    onRequest: [app.authenticate],
    schema: {
      response: {
        200: FleetHealthDTO,
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminOrOperator(req, reply)
    if (!auth.ok) return

    const scopeClause = auth.scope
      ? sql`AND d.commune_id = ${auth.scope.communeId}`
      : sql``

    const rows = await db.execute<FleetRowRaw>(sql`
      SELECT
        d.id,
        d.name,
        d.serial_number,
        d.status,
        c.name                         AS commune_name,
        d.firmware_version,
        d.last_seen_at,
        latest.received_at,
        latest.cpu_temp_c::float8      AS cpu_temp_c,
        latest.rssi_dbm,
        latest.free_mem_mb,
        latest.uptime_seconds,
        COALESCE(tickets.open_count, 0)::int     AS open_tickets,
        COALESCE(tickets.critical_count, 0)::int AS critical_tickets
      FROM distributors d
      LEFT JOIN communes c ON c.id = d.commune_id
      LEFT JOIN LATERAL (
        SELECT received_at, cpu_temp_c, rssi_dbm, free_mem_mb, uptime_seconds
        FROM distributor_heartbeats
        WHERE distributor_id = d.id
        ORDER BY received_at DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status IN ('open', 'in_progress'))::int          AS open_count,
          COUNT(*) FILTER (WHERE status IN ('open', 'in_progress')
                           AND severity >= 4)::int                                AS critical_count
        FROM maintenance_tickets
        WHERE distributor_id = d.id
      ) tickets ON true
      WHERE d.status != 'decommissioned'
        ${scopeClause}
      ORDER BY d.name ASC
    `)

    const HIGH_CPU_TEMP = 75
    const WEAK_SIGNAL = -80
    const LOW_MEMORY = 64
    const NO_HEARTBEAT_MS = 24 * 3600 * 1000

    const now = Date.now()
    const dtoRows = (rows as unknown as FleetRowRaw[]).map((r) => {
      const alerts: FleetAlert[] = []
      const lastSeenMs = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0
      if (r.status === 'offline') alerts.push('offline')
      if (!r.last_seen_at || now - lastSeenMs > NO_HEARTBEAT_MS) alerts.push('no_heartbeat_24h')
      if (r.cpu_temp_c != null && r.cpu_temp_c > HIGH_CPU_TEMP) alerts.push('high_cpu_temp')
      if (r.rssi_dbm != null && r.rssi_dbm < WEAK_SIGNAL) alerts.push('weak_signal')
      if (r.free_mem_mb != null && r.free_mem_mb < LOW_MEMORY) alerts.push('low_memory')
      if (r.critical_tickets > 0) alerts.push('open_critical')

      return {
        distributor: {
          id: r.id,
          name: r.name,
          serialNumber: r.serial_number,
          status: r.status,
          communeName: r.commune_name,
          firmwareVersion: r.firmware_version,
          lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
        },
        latest: {
          receivedAt: r.received_at ? new Date(r.received_at).toISOString() : null,
          cpuTempC: r.cpu_temp_c,
          rssiDbm: r.rssi_dbm,
          freeMemMb: r.free_mem_mb,
          uptimeSeconds: r.uptime_seconds,
        },
        openTickets: r.open_tickets,
        criticalTickets: r.critical_tickets,
        alerts,
      }
    })

    // Trie par nombre d'alertes décroissant pour faire remonter le plus
    // critique en haut de la liste.
    dtoRows.sort((a, b) => b.alerts.length - a.alerts.length)

    return {
      generatedAt: new Date().toISOString(),
      total: dtoRows.length,
      withAlerts: dtoRows.filter((r) => r.alerts.length > 0).length,
      rows: dtoRows,
    }
  })
}
