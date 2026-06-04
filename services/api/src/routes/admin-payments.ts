import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, payments, reservations, users,
} from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'

const PAYMENT_STATUS = ['pending', 'succeeded', 'failed', 'cancelled', 'refunded'] as const
const RESERVATION_STATUS = ['pending_payment', 'scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'] as const

const PaymentAdminDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(PAYMENT_STATUS),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  provider: z.string(),
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  reservation: z.object({
    id: z.string().uuid(),
    status: z.enum(RESERVATION_STATUS),
  }),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  item: z.object({
    typeName: z.string(),
  }),
})

const ListQuery = z.object({
  status: z.enum(PAYMENT_STATUS).optional(),
  /** Cursor opaque : `<iso8601>_<uuid>` (createdAt + id). */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

const ErrorDTO = z.object({ error: z.string() })

function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}_${id}`
}

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

export async function adminPaymentRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/payments — liste paginée des paiements de location, tri
   * DESC createdAt + id (tiebreaker). Pagination cursor opaque `<iso8601>_<uuid>`.
   *
   * Scope multi-tenant : un admin/operator ne voit que les paiements des
   * distributeurs de sa commune (via reservations → distributors.commune_id).
   * Super_admin : tous les paiements.
   *
   * Filtre optionnel `status` (pending/succeeded/failed/cancelled/refunded).
   */
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Paiements'],
      summary: 'Liste paginée des paiements de location (admin)',
      description: 'Tri DESC createdAt + id (tiebreaker). Pagination cursor opaque `<iso8601>_<uuid>`. '
        + 'Admin/operator scopé : ne voit que les paiements de sa commune. Super_admin : tous.\n\n'
        + '**Filtre** : `status` (pending/succeeded/failed/cancelled/refunded).',
      security: [{ bearerAuth: [] }],
      querystring: ListQuery,
      response: {
        200: z.object({
          items: z.array(PaymentAdminDTO),
          nextCursor: z.string().nullable()
            .describe('Cursor à passer en query `cursor=...` pour la page suivante. Null si fin.'),
        }),
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { status, cursor, limit } = req.query

    const conditions = []
    if (status) conditions.push(eq(payments.status, status))
    if (auth.scope) conditions.push(eq(distributors.communeId, auth.scope.communeId))
    if (cursor) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return reply.code(400).send({ error: 'invalid_cursor' })
      conditions.push(or(
        lt(payments.createdAt, decoded.createdAt),
        and(eq(payments.createdAt, decoded.createdAt), lt(payments.id, decoded.id)),
      )!)
    }

    const rows = await db
      .select({
        id: payments.id,
        status: payments.status,
        amountCents: payments.amountCents,
        currency: payments.currency,
        provider: payments.provider,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
        reservationId: reservations.id,
        reservationStatus: reservations.status,
        userId: users.id,
        userEmail: users.email,
        userDisplayName: users.displayName,
        distributorId: distributors.id,
        distributorName: distributors.name,
        itemTypeName: itemTypes.name,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .innerJoin(users, eq(users.id, payments.userId))
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null

    return {
      items: page.map((r) => ({
        id: r.id,
        status: r.status,
        amountCents: r.amountCents,
        currency: r.currency,
        provider: r.provider,
        createdAt: r.createdAt.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
        reservation: { id: r.reservationId, status: r.reservationStatus },
        user: { id: r.userId, email: r.userEmail, displayName: r.userDisplayName },
        distributor: { id: r.distributorId, name: r.distributorName },
        item: { typeName: r.itemTypeName },
      })),
      nextCursor,
    }
  })
}
