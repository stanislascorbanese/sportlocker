import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors, lockers } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'

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

const NearbyDistributorDTO = DistributorDTO.extend({
  distanceKm: z.number().min(0),
})

const NearbyQuery = z.object({
  lat:       z.coerce.number().min(-90).max(90),
  lng:       z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(500).default(5),
})

const CreateDistributorBody = z.object({
  serialNumber: z.string().min(3).max(40),
  communeId:    z.string().uuid(),
  name:         z.string().min(1).max(120),
  latitude:     z.number().min(-90).max(90).nullable().optional(),
  longitude:    z.number().min(-180).max(180).nullable().optional(),
  lockerCount:  z.number().int().min(1).max(64),
})

const UpdateDistributorBody = z.object({
  name:      z.string().min(1).max(120).optional(),
  status:    z.enum(['online', 'offline', 'maintenance', 'decommissioned']).optional(),
  latitude:  z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, {
  message: 'at_least_one_field_required',
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
   * GET /v1/distributors/nearby — distributeurs dans un rayon `radius_km`
   * autour de (lat,lng), tri par distance croissante. Haversine SQL pur.
   *
   * Postgres vanilla : pas d'extension earthdistance (cf. migration 0003).
   * Le GREATEST/LEAST clamp évite acos(>1) en bord d'arrondi flottant.
   */
  app.get('/nearby', {
    schema: {
      querystring: NearbyQuery,
      response: { 200: z.object({ items: z.array(NearbyDistributorDTO) }) },
    },
  }, async (req) => {
    const { lat, lng, radius_km } = req.query

    const distanceExpr = sql<number>`(
      6371 * acos(
        GREATEST(-1, LEAST(1,
          cos(radians(${lat})) * cos(radians(${distributors.latitude}))
          * cos(radians(${distributors.longitude}) - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(${distributors.latitude}))
        ))
      )
    )`

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
        distanceKm: distanceExpr.as('distance_km'),
      })
      .from(distributors)
      .where(sql`
        ${distributors.latitude} IS NOT NULL
        AND ${distributors.longitude} IS NOT NULL
        AND ${distanceExpr} <= ${radius_km}
      `)
      .orderBy(distanceExpr)
      .limit(100)

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
        distanceKm: d.distanceKm,
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

  /**
   * POST /v1/distributors — création admin. Crée le distributeur ET ses
   * N casiers (position 0..N-1, state=idle) dans une transaction.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      body: CreateDistributorBody,
      response: {
        201: DistributorDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const body = req.body

    // Admin scoped : ne peut créer que dans sa propre commune.
    if (auth.scope && body.communeId !== auth.scope.communeId) {
      return reply.code(403).send({ error: 'forbidden_cross_commune' })
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [d] = await tx
          .insert(distributors)
          .values({
            serialNumber: body.serialNumber,
            communeId:    body.communeId,
            name:         body.name,
            latitude:     body.latitude ?? null,
            longitude:    body.longitude ?? null,
            lockerCount:  body.lockerCount,
          })
          .returning()

        const lockerRows = Array.from({ length: body.lockerCount }, (_, i) => ({
          distributorId: d!.id,
          position: i,
          state: 'idle' as const,
        }))
        await tx.insert(lockers).values(lockerRows)

        return d!
      })

      return reply.code(201).send({
        id: created.id,
        serialNumber: created.serialNumber,
        name: created.name,
        status: created.status,
        communeId: created.communeId,
        lockerCount: created.lockerCount,
        idleLockers: created.lockerCount,
        latitude: created.latitude,
        longitude: created.longitude,
        batteryPercent: null,
        lastSeenAt: created.lastSeenAt?.toISOString() ?? null,
      })
    } catch (err) {
      const msg = (err as Error).message
      // unique_violation sur serial_number
      if (/duplicate key|unique/i.test(msg) && /serial/i.test(msg)) {
        return reply.code(409).send({ error: 'serial_number_conflict' })
      }
      // foreign_key_violation sur commune_id
      if (/foreign key/i.test(msg) && /commune/i.test(msg)) {
        return reply.code(404).send({ error: 'commune_not_found' })
      }
      throw err
    }
  })

  /**
   * PUT /v1/distributors/:id — mise à jour admin (name, status, lat, lng).
   * locker_count NON modifiable (impacte la structure physique du distributeur).
   */
  app.put('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateDistributorBody,
      response: {
        200: DistributorDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    // Admin scoped : 404 si le distributeur n'existe pas OU n'est pas dans sa commune.
    if (auth.scope) {
      const [check] = await db
        .select({ communeId: distributors.communeId })
        .from(distributors)
        .where(eq(distributors.id, req.params.id))
        .limit(1)
      if (!check || check.communeId !== auth.scope.communeId) {
        return reply.code(404).send({ error: 'distributor_not_found' })
      }
    }

    const body = req.body
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.name !== undefined)      update['name'] = body.name
    if (body.status !== undefined)    update['status'] = body.status
    if (body.latitude !== undefined)  update['latitude'] = body.latitude
    if (body.longitude !== undefined) update['longitude'] = body.longitude

    const [updated] = await db
      .update(distributors)
      .set(update)
      .where(eq(distributors.id, req.params.id))
      .returning()

    if (!updated) return reply.code(404).send({ error: 'distributor_not_found' })

    const [idle] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(lockers)
      .where(and(eq(lockers.distributorId, updated.id), eq(lockers.state, 'idle')))

    return {
      id: updated.id,
      serialNumber: updated.serialNumber,
      name: updated.name,
      status: updated.status,
      communeId: updated.communeId,
      lockerCount: updated.lockerCount,
      idleLockers: idle?.count ?? 0,
      latitude: updated.latitude,
      longitude: updated.longitude,
      batteryPercent: null,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
    }
  })
}
