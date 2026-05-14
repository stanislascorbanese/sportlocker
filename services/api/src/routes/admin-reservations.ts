import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, reservations, users,
} from '../db/schema.js'

const RESERVATION_STATUS = ['pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'] as const

const ReservationAdminDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(RESERVATION_STATUS),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  openedAt: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  extensionCount: z.number().int().min(0),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
  }),
  item: z.object({
    id: z.string().uuid(),
    typeName: z.string(),
  }),
})

const ListQuery = z.object({
  status: z.enum(RESERVATION_STATUS).optional(),
  distributorId: z.string().uuid().optional(),
  /** Cursor opaque : `<iso8601>_<uuid>` (createdAt + id). */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const ErrorDTO = z.object({ error: z.string() })

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`
}

/** Décode un cursor; renvoie null si format invalide. */
function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  const idx = raw.indexOf('_')
  if (idx <= 0) return null
  const iso = raw.slice(0, idx)
  const id = raw.slice(idx + 1)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  return { createdAt: d, id }
}

export async function adminReservationRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/reservations — liste paginée toutes réservations, tri DESC createdAt.
   * Filtres : status, distributorId. Pagination cursor (createdAt + id tiebreaker).
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      querystring: ListQuery,
      response: {
        200: z.object({
          items: z.array(ReservationAdminDTO),
          nextCursor: z.string().nullable(),
        }),
        401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    if (req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden_admin_required' })
    }

    const { status, distributorId, cursor, limit } = req.query

    const conditions = []
    if (status) conditions.push(eq(reservations.status, status))
    if (distributorId) conditions.push(eq(reservations.distributorId, distributorId))
    if (cursor) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return reply.code(400).send({ error: 'invalid_cursor' })
      // (createdAt, id) < (cursor.createdAt, cursor.id) en ordre lexicographique
      conditions.push(or(
        lt(reservations.createdAt, decoded.createdAt),
        and(eq(reservations.createdAt, decoded.createdAt), lt(reservations.id, decoded.id)),
      )!)
    }

    const rows = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        openedAt: reservations.openedAt,
        returnedAt: reservations.returnedAt,
        dueAt: reservations.dueAt,
        extensionCount: reservations.extensionCount,
        userId: users.id,
        userEmail: users.email,
        userDisplayName: users.displayName,
        distributorId: distributors.id,
        distributorName: distributors.name,
        distributorSerial: distributors.serialNumber,
        itemId: items.id,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(users, eq(users.id, reservations.userId))
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(reservations.createdAt), desc(reservations.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null

    return {
      items: page.map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
        openedAt: r.openedAt?.toISOString() ?? null,
        returnedAt: r.returnedAt?.toISOString() ?? null,
        dueAt: r.dueAt?.toISOString() ?? null,
        extensionCount: r.extensionCount,
        user: { id: r.userId, email: r.userEmail, displayName: r.userDisplayName },
        distributor: { id: r.distributorId, name: r.distributorName, serialNumber: r.distributorSerial },
        item: { id: r.itemId, typeName: r.itemTypeName },
      })),
      nextCursor,
    }
  })
}
