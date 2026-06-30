import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../db/client.js'
import { distributors, lockerEvents, lockers, reservations, users } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'

/**
 * Audit / Activité — stream chronologique de tous les `locker_events`.
 *
 * Sert de log RGPD "qui a fait quoi quand" : visible par les admins commune
 * (scope = leur commune) et les super_admins (cross-tenant).
 *
 * Pour le moment on consomme uniquement la table `locker_events` parce qu'elle
 * couvre déjà 90% des actions intéressantes : réservation créée, casier ouvert,
 * retour validé, annulation (notamment source='admin' = force-cancel dashboard),
 * extension, expiration, incident, maintenance. Une future table dédiée
 * `admin_actions` viendra compléter pour les actions hors-casier (édition
 * commune, ban utilisateur, etc.).
 */

const LOCKER_EVENT_TYPE = [
  'reserved', 'opened', 'closed', 'returned',
  'expired', 'cancelled', 'fault', 'maintenance', 'extended',
] as const

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected_yyyy_mm_dd')

const ListQuery = z.object({
  from:          DateOnly.optional(),
  to:            DateOnly.optional(),
  eventType:     z.enum(LOCKER_EVENT_TYPE).optional(),
  /** Texte libre (admin, api, system, firmware, …). Match exact. */
  source:        z.string().min(1).max(40).optional(),
  distributorId: z.string().uuid().optional(),
  /** Cursor opaque `<iso8601>_<uuid>` (createdAt + id). */
  cursor:        z.string().optional(),
  limit:         z.coerce.number().int().min(1).max(500).default(100),
})

const AuditEventDTO = z.object({
  id:        z.string().uuid(),
  eventType: z.enum(LOCKER_EVENT_TYPE),
  source:    z.string(),
  metadata:  z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  locker: z.object({
    id:       z.string().uuid(),
    position: z.number().int(),
  }),
  distributor: z.object({
    id:           z.string().uuid(),
    name:         z.string(),
    serialNumber: z.string(),
    communeId:    z.string().uuid(),
  }),
  reservation: z.object({
    id:        z.string().uuid(),
    userEmail: z.string(),
  }).nullable(),
})

const ErrorDTO = z.object({ error: z.string() })

function fromDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function toDateExclusive(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

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

export async function adminAuditRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/admin/audit/recent — stream chronologique DESC paginé via cursor.
   *
   * Scope :
   *   - super_admin : tous les events
   *   - admin       : events des distributeurs de sa commune (JOIN scoped)
   *
   * La pagination cursor garantit la stabilité même quand de nouveaux events
   * tombent en arrière-plan (contrairement à OFFSET qui décale).
   */
  app.get('/recent', {
    onRequest: [app.authenticate],
    schema: {
      querystring: ListQuery,
      response: {
        200: z.object({
          items: z.array(AuditEventDTO),
          nextCursor: z.string().nullable(),
        }),
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { from, to, eventType, source, distributorId, cursor, limit } = req.query

    const conditions = []
    if (eventType)     conditions.push(eq(lockerEvents.eventType, eventType))
    if (source)        conditions.push(eq(lockerEvents.source, source))
    if (distributorId) conditions.push(eq(distributors.id, distributorId))
    if (from)          conditions.push(gte(lockerEvents.createdAt, fromDate(from)))
    if (to)            conditions.push(lt(lockerEvents.createdAt, toDateExclusive(to)))
    if (auth.scope)    conditions.push(eq(distributors.communeId, auth.scope.communeId))

    if (cursor) {
      const decoded = decodeCursor(cursor)
      if (!decoded) return reply.code(400).send({ error: 'invalid_cursor' })
      conditions.push(or(
        lt(lockerEvents.createdAt, decoded.createdAt),
        and(eq(lockerEvents.createdAt, decoded.createdAt), lt(lockerEvents.id, decoded.id)),
      )!)
    }

    // reservationId est nullable côté DB (onDelete: 'set null'), donc users
    // doit être leftJoin également pour ne pas perdre les events orphelins.
    const rows = await db
      .select({
        id:                lockerEvents.id,
        eventType:         lockerEvents.eventType,
        source:            lockerEvents.source,
        metadata:          lockerEvents.metadata,
        createdAt:         lockerEvents.createdAt,
        lockerId:          lockers.id,
        lockerPosition:    lockers.position,
        distributorId:     distributors.id,
        distributorName:   distributors.name,
        distributorSerial: distributors.serialNumber,
        communeId:         distributors.communeId,
        reservationId:     reservations.id,
        userEmail:         users.email,
      })
      .from(lockerEvents)
      .innerJoin(lockers, eq(lockers.id, lockerEvents.lockerId))
      .innerJoin(distributors, eq(distributors.id, lockers.distributorId))
      .leftJoin(reservations, eq(reservations.id, lockerEvents.reservationId))
      .leftJoin(users, eq(users.id, reservations.userId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(lockerEvents.createdAt), desc(lockerEvents.id))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const last = page[page.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null

    return {
      items: page.map((r) => ({
        id:        r.id,
        eventType: r.eventType,
        source:    r.source,
        metadata:  (r.metadata ?? {}) as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        locker: {
          id:       r.lockerId,
          position: r.lockerPosition,
        },
        distributor: {
          id:           r.distributorId,
          name:         r.distributorName,
          serialNumber: r.distributorSerial,
          communeId:    r.communeId,
        },
        reservation: r.reservationId && r.userEmail
          ? { id: r.reservationId, userEmail: r.userEmail }
          : null,
      })),
      nextCursor,
    }
  })
}
