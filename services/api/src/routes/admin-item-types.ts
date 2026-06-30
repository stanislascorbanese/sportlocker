import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { itemTypes, items } from '../db/schema.js'
import { requireAdminScope, requireSuperAdmin } from '../lib/commune-scope.js'
import { PG_ERRORS, isPgViolation } from '../lib/pg-errors.js'

const ItemTypeAdminDTO = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  cautionCents: z.number().int().nonnegative(),
  maxDurationMinutes: z.number().int().positive(),
  activeItemCount: z.number().int().nonnegative(),
  totalReservations: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

const CreateBody = z.object({
  slug:               z.string().trim().regex(/^[a-z0-9-]+$/, 'must_be_kebab_case').min(2).max(60),
  name:               z.string().trim().min(1).max(120),
  category:           z.string().trim().min(1).max(40),
  description:        z.string().trim().max(2000).nullable().optional(),
  imageUrl:           z.string().trim().url().max(500).nullable().optional(),
  cautionCents:       z.number().int().min(0).max(100_000_000),
  maxDurationMinutes: z.number().int().min(15).max(7 * 24 * 60),
})

const UpdateBody = z.object({
  name:               z.string().trim().min(1).max(120).optional(),
  category:           z.string().trim().min(1).max(40).optional(),
  description:        z.string().trim().max(2000).nullable().optional(),
  imageUrl:           z.string().trim().url().max(500).nullable().optional(),
  cautionCents:       z.number().int().min(0).max(100_000_000).optional(),
  maxDurationMinutes: z.number().int().min(15).max(7 * 24 * 60).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

const ErrorDTO = z.object({ error: z.string() })

type ItemTypeRow = {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  imageUrl: string | null
  cautionCents: number
  maxDurationMinutes: number
  activeItemCount: number
  totalReservations: number
  createdAt: Date
}

function rowToDto(r: ItemTypeRow) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    description: r.description,
    imageUrl: r.imageUrl,
    cautionCents: r.cautionCents,
    maxDurationMinutes: r.maxDurationMinutes,
    activeItemCount: r.activeItemCount,
    totalReservations: r.totalReservations,
    createdAt: r.createdAt.toISOString(),
  }
}

const activeItemCountExpr = sql<number>`(
  SELECT COUNT(*)::int FROM items WHERE items.item_type_id = item_types.id
)`.as('active_item_count')

const totalReservationsExpr = sql<number>`(
  SELECT COUNT(*)::int FROM reservations
  WHERE reservations.item_id IN (
    SELECT id FROM items WHERE items.item_type_id = item_types.id
  )
)`.as('total_reservations')

const baseSelect = {
  id: itemTypes.id,
  slug: itemTypes.slug,
  name: itemTypes.name,
  category: itemTypes.category,
  description: itemTypes.description,
  imageUrl: itemTypes.imageUrl,
  cautionCents: itemTypes.cautionCents,
  maxDurationMinutes: itemTypes.maxDurationMinutes,
  createdAt: itemTypes.createdAt,
  activeItemCount: activeItemCountExpr,
  totalReservations: totalReservationsExpr,
}

export async function adminItemTypeRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/item-types — catalogue global des types d'articles.
   * Tri par name ASC. Inclut le compte d'items physiques et de réservations totales.
   * Les item_types sont globaux (pas scopés commune) — un admin scoped voit tout.
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      response: {
        200: z.object({ items: z.array(ItemTypeAdminDTO) }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const rows = await db
      .select(baseSelect)
      .from(itemTypes)
      .orderBy(asc(itemTypes.name))
      .limit(500)

    return { items: rows.map(rowToDto) }
  })

  /**
   * GET /v1/admin/item-types/:id — détail single type.
   */
  app.get('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: { 200: ItemTypeAdminDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const [row] = await db
      .select(baseSelect)
      .from(itemTypes)
      .where(eq(itemTypes.id, req.params.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'item_type_not_found' })
    return rowToDto(row)
  })

  /**
   * POST /v1/admin/item-types — créer un type. super_admin uniquement
   * (catalogue global, action système comme la création de commune).
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      body: CreateBody,
      response: { 201: ItemTypeAdminDTO, 400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 409: ErrorDTO },
    },
  }, async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const body = req.body
    try {
      const [created] = await db.insert(itemTypes).values({
        slug:               body.slug,
        name:               body.name,
        category:           body.category,
        description:        body.description ?? null,
        imageUrl:           body.imageUrl ?? null,
        cautionCents:       body.cautionCents,
        maxDurationMinutes: body.maxDurationMinutes,
      }).returning()

      return reply.code(201).send({
        id: created!.id,
        slug: created!.slug,
        name: created!.name,
        category: created!.category,
        description: created!.description,
        imageUrl: created!.imageUrl,
        cautionCents: created!.cautionCents,
        maxDurationMinutes: created!.maxDurationMinutes,
        activeItemCount: 0,
        totalReservations: 0,
        createdAt: created!.createdAt.toISOString(),
      })
    } catch (err) {
      // Codes SQLSTATE robustes vs Drizzle 0.30/0.45+ (cf. lib/pg-errors.ts)
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'slug')) {
        return reply.code(409).send({ error: 'slug_conflict' })
      }
      throw err
    }
  })

  /**
   * PUT /v1/admin/item-types/:id — mise à jour partielle.
   * slug non modifiable (clé fonctionnelle utilisée par firmware/clients).
   */
  app.put('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      body: UpdateBody,
      response: { 200: ItemTypeAdminDTO, 400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const body = req.body
    const update: Record<string, unknown> = {}
    if (body.name !== undefined)               update['name'] = body.name
    if (body.category !== undefined)           update['category'] = body.category
    if (body.description !== undefined)        update['description'] = body.description
    if (body.imageUrl !== undefined)           update['imageUrl'] = body.imageUrl
    if (body.cautionCents !== undefined)       update['cautionCents'] = body.cautionCents
    if (body.maxDurationMinutes !== undefined) update['maxDurationMinutes'] = body.maxDurationMinutes

    const [updated] = await db
      .update(itemTypes)
      .set(update)
      .where(eq(itemTypes.id, req.params.id))
      .returning({ id: itemTypes.id })

    if (!updated) return reply.code(404).send({ error: 'item_type_not_found' })

    const [row] = await db
      .select(baseSelect)
      .from(itemTypes)
      .where(eq(itemTypes.id, updated.id))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'item_type_not_found' })
    return rowToDto(row)
  })

  /**
   * DELETE /v1/admin/item-types/:id — suppression dure.
   * Refuse 409 in_use_by_items si au moins un item référence ce type
   * (FK onDelete:restrict côté Drizzle/SQL).
   */
  app.delete('/:id', {
    onRequest: [app.authenticate],
    schema: {
      params: z.object({ id: z.string().uuid() }),
      response: {
        204: z.null(),
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return

    const [usage] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(items)
      .where(eq(items.itemTypeId, req.params.id))

    if ((usage?.count ?? 0) > 0) {
      return reply.code(409).send({ error: 'in_use_by_items' })
    }

    const [deleted] = await db
      .delete(itemTypes)
      .where(eq(itemTypes.id, req.params.id))
      .returning({ id: itemTypes.id })

    if (!deleted) return reply.code(404).send({ error: 'item_type_not_found' })
    return reply.code(204).send(null)
  })
}
