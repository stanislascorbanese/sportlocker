import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors, lockers } from '../db/schema.js'

const DistributorDTO = z.object({
  id: z.string().uuid(),
  serialNumber: z.string(),
  name: z.string(),
  status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
  communeId: z.string().uuid(),
  lockerCount: z.number().int().positive(),
  idleLockers: z.number().int().min(0),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Pas encore tracé en DB (pas de colonne battery_percent sur heartbeats). */
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  lastSeenAt: z.string().datetime().nullable(),
})

const ErrorDTO = z.object({ error: z.string() })

export async function distributorRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/distributors — liste paginée du parc (limit 200), incluant lat/lng
   * et le compte de casiers idle (sous-requête COUNT).
   */
  app.get('/', {
    schema: { response: { 200: z.object({ items: z.array(DistributorDTO) }) } },
  }, async () => {
    const idleCount = sql<number>`(
      SELECT COUNT(*)::int FROM lockers
      WHERE lockers.distributor_id = distributors.id
        AND lockers.state = 'idle'
    )`.as('idle_lockers')

    const rows = await db
      .select({
        id: distributors.id,
        serialNumber: distributors.serialNumber,
        name: distributors.name,
        status: distributors.status,
        communeId: distributors.communeId,
        lockerCount: distributors.lockerCount,
        latitude: distributors.latitude,
        longitude: distributors.longitude,
        lastSeenAt: distributors.lastSeenAt,
        idleLockers: idleCount,
      })
      .from(distributors)
      .limit(200)

    return {
      items: rows.map((d) => ({
        id: d.id,
        serialNumber: d.serialNumber,
        name: d.name,
        status: d.status,
        communeId: d.communeId,
        lockerCount: d.lockerCount,
        idleLockers: d.idleLockers,
        latitude: d.latitude,
        longitude: d.longitude,
        batteryPercent: null,
        lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      })),
    }
  })

  /**
   * GET /v1/distributors/:id — détail + casiers du distributeur.
   */
  app.get('/:id', {
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: DistributorDTO.extend({
          lockers: z.array(z.object({
            id: z.string().uuid(),
            position: z.number().int(),
            state: z.enum(['idle', 'reserved', 'active', 'returning', 'fault']),
            currentItemId: z.string().uuid().nullable(),
          })),
        }),
        404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const found = await db.select().from(distributors).where(eq(distributors.id, req.params.id)).limit(1)
    if (found.length === 0) return reply.code(404).send({ error: 'distributor_not_found' })

    const d = found[0]!
    const lockerRows = await db.select({
      id: lockers.id,
      position: lockers.position,
      state: lockers.state,
      currentItemId: lockers.currentItemId,
    }).from(lockers).where(eq(lockers.distributorId, d.id)).orderBy(lockers.position)

    const idleLockers = lockerRows.filter((l) => l.state === 'idle').length

    return {
      id: d.id,
      serialNumber: d.serialNumber,
      name: d.name,
      status: d.status,
      communeId: d.communeId,
      lockerCount: d.lockerCount,
      idleLockers,
      latitude: d.latitude,
      longitude: d.longitude,
      batteryPercent: null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      lockers: lockerRows,
    }
  })
}
