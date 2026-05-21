import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors, itemTypes, items, lockers } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { PG_ERRORS, isPgViolation } from '../lib/pg-errors.js'

/**
 * Lever depuis une transaction pour signaler que le locker visé ne peut pas
 * accueillir d'item (déjà chargé ou state ≠ 'idle'). Mappé en 409 par le
 * handler appelant.
 */
class LockerNotAvailableError extends Error {
  constructor() { super('locker_not_available'); this.name = 'LockerNotAvailableError' }
}

const ITEM_CONDITION = ['new', 'good', 'worn', 'damaged', 'lost'] as const

const ItemDTO = z.object({
  id: z.string().uuid(),
  rfidTag: z.string(),
  condition: z.enum(ITEM_CONDITION),
  totalLoans: z.number().int().nonnegative(),
  lastInspectedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  itemType: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  currentLocker: z.object({
    id: z.string().uuid(),
    position: z.number().int(),
    distributor: z.object({
      id: z.string().uuid(),
      name: z.string(),
      serialNumber: z.string(),
      communeId: z.string().uuid(),
    }),
  }).nullable(),
})

const ListQuery = z.object({
  itemTypeId:      z.string().uuid().optional(),
  condition:       z.enum(ITEM_CONDITION).optional(),
  currentLockerId: z.string().uuid().optional(),
  distributorId:   z.string().uuid().optional(),
  q:               z.string().min(1).max(100).optional(),
  limit:           z.coerce.number().int().min(1).max(200).default(200),
})

const CreateBody = z.object({
  itemTypeId:      z.string().uuid(),
  rfidTag:         z.string().trim().min(4).max(64),
  condition:       z.enum(ITEM_CONDITION).default('new'),
  currentLockerId: z.string().uuid().nullable().optional(),
})

const UpdateBody = z.object({
  rfidTag:         z.string().trim().min(4).max(64).optional(),
  condition:       z.enum(ITEM_CONDITION).optional(),
  currentLockerId: z.string().uuid().nullable().optional(),
  lastInspectedAt: z.string().datetime().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

const ErrorDTO = z.object({ error: z.string() })

type ItemRow = {
  id: string
  rfidTag: string
  condition: typeof ITEM_CONDITION[number]
  totalLoans: number
  lastInspectedAt: Date | null
  createdAt: Date
  itemTypeId: string
  itemTypeSlug: string
  itemTypeName: string
  itemTypeCategory: string
  lockerId: string | null
  lockerPosition: number | null
  distributorId: string | null
  distributorName: string | null
  distributorSerial: string | null
  distributorCommuneId: string | null
}

function rowToDto(r: ItemRow) {
  return {
    id: r.id,
    rfidTag: r.rfidTag,
    condition: r.condition,
    totalLoans: r.totalLoans,
    lastInspectedAt: r.lastInspectedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    itemType: {
      id: r.itemTypeId,
      slug: r.itemTypeSlug,
      name: r.itemTypeName,
      category: r.itemTypeCategory,
    },
    currentLocker: r.lockerId && r.lockerPosition !== null && r.distributorId
      && r.distributorName !== null && r.distributorSerial !== null
      && r.distributorCommuneId !== null
      ? {
          id: r.lockerId,
          position: r.lockerPosition,
          distributor: {
            id: r.distributorId,
            name: r.distributorName,
            serialNumber: r.distributorSerial,
            communeId: r.distributorCommuneId,
          },
        }
      : null,
  }
}

const baseSelect = {
  id: items.id,
  rfidTag: items.rfidTag,
  condition: items.condition,
  totalLoans: items.totalLoans,
  lastInspectedAt: items.lastInspectedAt,
  createdAt: items.createdAt,
  itemTypeId: itemTypes.id,
  itemTypeSlug: itemTypes.slug,
  itemTypeName: itemTypes.name,
  itemTypeCategory: itemTypes.category,
  lockerId: lockers.id,
  lockerPosition: lockers.position,
  distributorId: distributors.id,
  distributorName: distributors.name,
  distributorSerial: distributors.serialNumber,
  distributorCommuneId: distributors.communeId,
}

export async function adminItemRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/items — liste paginée d'articles physiques (limit 200).
   * Filtres : itemTypeId, condition, currentLockerId, distributorId, q (RFID).
   *
   * Scope multi-tenant :
   *   - super_admin : tous les items, y compris orphelins (currentLockerId=null).
   *   - admin scoped : uniquement les items dont le locker actuel appartient à
   *     un distributeur de sa commune. Les orphelins sont masqués.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      querystring: ListQuery,
      response: {
        200: z.object({ items: z.array(ItemDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { itemTypeId, condition, currentLockerId, distributorId, q, limit } = req.query

    const conditions = []
    if (itemTypeId) conditions.push(eq(items.itemTypeId, itemTypeId))
    if (condition) conditions.push(eq(items.condition, condition))
    if (currentLockerId) conditions.push(eq(items.currentLockerId, currentLockerId))
    if (distributorId) conditions.push(eq(distributors.id, distributorId))
    if (q) {
      const pattern = `%${q}%`
      conditions.push(sql`${items.rfidTag} ILIKE ${pattern}`)
    }
    if (auth.scope) {
      // Admin scoped : item dont distributor.communeId = sa commune. Pas d'orphelins.
      conditions.push(eq(distributors.communeId, auth.scope.communeId))
    }

    const rows = await db
      .select(baseSelect)
      .from(items)
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .leftJoin(lockers, eq(lockers.id, items.currentLockerId))
      .leftJoin(distributors, eq(distributors.id, lockers.distributorId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(items.createdAt))
      .limit(limit)

    return { items: rows.map(rowToDto) }
  })

  /**
   * GET /v1/admin/items/:id — détail single item.
   * Admin scoped : 404 si l'item n'est pas dans sa commune (ou orphelin).
   */
  app.get('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: { 200: ItemDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const [row] = await db
      .select(baseSelect)
      .from(items)
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .leftJoin(lockers, eq(lockers.id, items.currentLockerId))
      .leftJoin(distributors, eq(distributors.id, lockers.distributorId))
      .where(eq(items.id, req.params.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'item_not_found' })

    if (auth.scope) {
      // Orphan ou autre commune → 404 pour l'admin scoped.
      if (!row.distributorCommuneId || row.distributorCommuneId !== auth.scope.communeId) {
        return reply.code(404).send({ error: 'item_not_found' })
      }
    }

    return rowToDto(row)
  })

  /**
   * POST /v1/admin/items — créer un article physique.
   *
   * Règles scope :
   *   - super_admin : peut créer avec ou sans locker, n'importe où.
   *   - admin scoped : doit fournir un currentLockerId appartenant à un
   *     distributeur de sa commune. Création orphan refusée.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      body: CreateBody,
      response: {
        201: ItemDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const body = req.body

    if (auth.scope) {
      if (!body.currentLockerId) {
        return reply.code(403).send({ error: 'forbidden_orphan_create_super_admin_only' })
      }
      const [lockerCheck] = await db
        .select({ communeId: distributors.communeId })
        .from(lockers)
        .innerJoin(distributors, eq(distributors.id, lockers.distributorId))
        .where(eq(lockers.id, body.currentLockerId))
        .limit(1)
      if (!lockerCheck) return reply.code(404).send({ error: 'locker_not_found' })
      if (lockerCheck.communeId !== auth.scope.communeId) {
        return reply.code(403).send({ error: 'forbidden_cross_commune' })
      }
    }

    // Le type doit exister (FK restrict de toute façon, mais 404 plus explicite).
    const [typeCheck] = await db
      .select({ id: itemTypes.id })
      .from(itemTypes)
      .where(eq(itemTypes.id, body.itemTypeId))
      .limit(1)
    if (!typeCheck) return reply.code(404).send({ error: 'item_type_not_found' })

    try {
      const createdId = await db.transaction(async (tx) => {
        const [created] = await tx.insert(items).values({
          itemTypeId:      body.itemTypeId,
          rfidTag:         body.rfidTag,
          condition:       body.condition,
          currentLockerId: body.currentLockerId ?? null,
        }).returning({ id: items.id })

        // Synchronise lockers.current_item_id : sans ça la grille du dashboard
        // (GET /v1/distributors/:id LEFT JOIN items via lockers.current_item_id)
        // ne voit pas le nouveau matériel et l'affiche comme "casier vide".
        // L'UPDATE conditionné par `current_item_id IS NULL AND state='idle'`
        // garantit l'atomicité face à 2 POST concurrents sur le même casier.
        if (body.currentLockerId) {
          const occupied = await tx
            .update(lockers)
            .set({ currentItemId: created!.id, updatedAt: new Date() })
            .where(and(
              eq(lockers.id, body.currentLockerId),
              isNull(lockers.currentItemId),
              eq(lockers.state, 'idle'),
            ))
            .returning({ id: lockers.id })
          if (occupied.length === 0) {
            throw new LockerNotAvailableError()
          }
        }

        return created!.id
      })

      const [row] = await db
        .select(baseSelect)
        .from(items)
        .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
        .leftJoin(lockers, eq(lockers.id, items.currentLockerId))
        .leftJoin(distributors, eq(distributors.id, lockers.distributorId))
        .where(eq(items.id, createdId))
        .limit(1)

      if (!row) return reply.code(404).send({ error: 'item_not_found' })
      return reply.code(201).send(rowToDto(row))
    } catch (err) {
      if (err instanceof LockerNotAvailableError) {
        return reply.code(409).send({ error: 'locker_not_available' })
      }
      // Codes SQLSTATE robustes vs Drizzle 0.30/0.45+ (cf. lib/pg-errors.ts)
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'rfid')) {
        return reply.code(409).send({ error: 'rfid_tag_conflict' })
      }
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION, 'item_type')) {
        return reply.code(404).send({ error: 'item_type_not_found' })
      }
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION, 'locker')) {
        return reply.code(404).send({ error: 'locker_not_found' })
      }
      throw err
    }
  })

  /**
   * PUT /v1/admin/items/:id — mise à jour partielle.
   * itemTypeId NON modifiable (un item physique est une instance figée d'un type).
   *
   * Scope :
   *   - admin scoped : l'item DOIT déjà être dans sa commune, et toute
   *     nouvelle currentLockerId doit également l'être.
   */
  app.put('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: {
        200: ItemDTO,
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const body = req.body

    if (auth.scope) {
      // 1. Item actuellement dans la commune scoped ?
      const [check] = await db
        .select({ communeId: distributors.communeId })
        .from(items)
        .leftJoin(lockers, eq(lockers.id, items.currentLockerId))
        .leftJoin(distributors, eq(distributors.id, lockers.distributorId))
        .where(eq(items.id, req.params.id))
        .limit(1)
      if (!check || check.communeId !== auth.scope.communeId) {
        return reply.code(404).send({ error: 'item_not_found' })
      }
      // 2. Nouvelle locker dans la même commune ? (null interdit pour scoped)
      if (body.currentLockerId === null) {
        return reply.code(403).send({ error: 'forbidden_unassign_super_admin_only' })
      }
      if (body.currentLockerId !== undefined) {
        const [lockerCheck] = await db
          .select({ communeId: distributors.communeId })
          .from(lockers)
          .innerJoin(distributors, eq(distributors.id, lockers.distributorId))
          .where(eq(lockers.id, body.currentLockerId))
          .limit(1)
        if (!lockerCheck) return reply.code(404).send({ error: 'locker_not_found' })
        if (lockerCheck.communeId !== auth.scope.communeId) {
          return reply.code(403).send({ error: 'forbidden_cross_commune' })
        }
      }
    }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (body.rfidTag !== undefined)         update['rfidTag'] = body.rfidTag
    if (body.condition !== undefined)       update['condition'] = body.condition
    if (body.currentLockerId !== undefined) update['currentLockerId'] = body.currentLockerId
    if (body.lastInspectedAt !== undefined) {
      update['lastInspectedAt'] = body.lastInspectedAt ? new Date(body.lastInspectedAt) : null
    }

    try {
      const updatedId = await db.transaction(async (tx) => {
        // Lit le locker actuel avant l'UPDATE pour pouvoir le libérer après si
        // l'item change de casier (cf. synchro lockers.current_item_id décrite
        // sur le POST).
        let oldLockerId: string | null = null
        if (body.currentLockerId !== undefined) {
          const [before] = await tx
            .select({ currentLockerId: items.currentLockerId })
            .from(items)
            .where(eq(items.id, req.params.id))
            .limit(1)
          if (!before) return null
          oldLockerId = before.currentLockerId
        }

        const [updated] = await tx
          .update(items)
          .set(update)
          .where(eq(items.id, req.params.id))
          .returning({ id: items.id })
        if (!updated) return null

        if (body.currentLockerId !== undefined) {
          const newLockerId = body.currentLockerId

          // Libère l'ancien casier si l'item le quittait. La clause sur
          // current_item_id évite d'écraser un locker remappé entre temps.
          if (oldLockerId && oldLockerId !== newLockerId) {
            await tx
              .update(lockers)
              .set({ currentItemId: null, updatedAt: new Date() })
              .where(and(
                eq(lockers.id, oldLockerId),
                eq(lockers.currentItemId, req.params.id),
              ))
          }

          // Occupe le nouveau (idempotent si oldLockerId === newLockerId).
          if (newLockerId && newLockerId !== oldLockerId) {
            const occupied = await tx
              .update(lockers)
              .set({ currentItemId: req.params.id, updatedAt: new Date() })
              .where(and(
                eq(lockers.id, newLockerId),
                isNull(lockers.currentItemId),
                eq(lockers.state, 'idle'),
              ))
              .returning({ id: lockers.id })
            if (occupied.length === 0) {
              throw new LockerNotAvailableError()
            }
          }
        }

        return updated.id
      })

      if (!updatedId) return reply.code(404).send({ error: 'item_not_found' })

      const [row] = await db
        .select(baseSelect)
        .from(items)
        .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
        .leftJoin(lockers, eq(lockers.id, items.currentLockerId))
        .leftJoin(distributors, eq(distributors.id, lockers.distributorId))
        .where(eq(items.id, updatedId))
        .limit(1)

      if (!row) return reply.code(404).send({ error: 'item_not_found' })
      return rowToDto(row)
    } catch (err) {
      if (err instanceof LockerNotAvailableError) {
        return reply.code(409).send({ error: 'locker_not_available' })
      }
      // Codes SQLSTATE robustes vs Drizzle 0.30/0.45+ (cf. lib/pg-errors.ts)
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'rfid')) {
        return reply.code(409).send({ error: 'rfid_tag_conflict' })
      }
      if (isPgViolation(err, PG_ERRORS.FOREIGN_KEY_VIOLATION, 'locker')) {
        return reply.code(404).send({ error: 'locker_not_found' })
      }
      throw err
    }
  })

}
