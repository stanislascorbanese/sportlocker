import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq, gte, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'

import { ReservationStatus } from '@sportlocker/types'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, reservations, users,
} from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { emitLockerChange } from '../lib/live-emit.js'

const ReservationAdminDTO = z.object({
  id: z.string().uuid(),
  status: ReservationStatus,
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

const LOCKER_EVENT_TYPE = [
  'reserved', 'opened', 'closed', 'returned',
  'expired', 'cancelled', 'fault', 'maintenance', 'extended',
] as const

const ReservationEventDTO = z.object({
  id: z.string().uuid(),
  eventType: z.enum(LOCKER_EVENT_TYPE),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
})

const ReservationDetailDTO = ReservationAdminDTO.extend({
  cancellationReason: z.string().nullable(),
  qrJti: z.string(),
  events: z.array(ReservationEventDTO),
})

/** Date au format YYYY-MM-DD. Reçue côté UI date picker. */
const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected_yyyy_mm_dd')

const ListQuery = z.object({
  status: ReservationStatus.optional(),
  distributorId: z.string().uuid().optional(),
  /** Borne basse inclusive : created_at >= from 00:00:00 UTC */
  from: DateOnly.optional(),
  /** Borne haute exclusive : created_at < (to + 1 jour) UTC, i.e. inclusive sur la journée */
  to: DateOnly.optional(),
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

const ExportQuery = z.object({
  status:        ReservationStatus.optional(),
  distributorId: z.string().uuid().optional(),
  from:          DateOnly.optional(),
  to:            DateOnly.optional(),
})

/** Borne basse : 00:00:00 UTC du jour `iso`. */
function fromDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Borne haute exclusive : 00:00:00 UTC du jour suivant (inclut le jour `iso`). */
function toDateExclusive(iso: string): Date {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

/** Escape CSV cell selon RFC 4180 : guillemets doublés, champ entouré
 *  de guillemets si contient virgule / guillemet / retour ligne. */
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
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
      tags: ['Admin — Réservations'],
      summary: 'Liste paginée des réservations (admin)',
      description: 'Tri DESC createdAt + id (tiebreaker). Pagination cursor opaque `<iso8601>_<uuid>`. '
        + 'Admin scopé : ne voit que les distributeurs de sa commune. Super_admin : toutes.\n\n'
        + '**Exemple** : `GET /v1/admin/reservations?status=active&distributorId=…&limit=20`\n\n'
        + '**Filtres** : `status`, `distributorId`, `from`/`to` (YYYY-MM-DD, fenêtre sur created_at).',
      security: [{ bearerAuth: [] }],
      querystring: ListQuery,
      response: {
        200: z.object({
          items: z.array(ReservationAdminDTO),
          nextCursor: z.string().nullable().describe('Cursor à passer en query `cursor=...` pour la page suivante. Null si fin.'),
        }),
        400: ErrorDTO, 401: ErrorDTO, 403: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { status, distributorId, from, to, cursor, limit } = req.query

    const conditions = []
    if (status) conditions.push(eq(reservations.status, status))
    if (distributorId) conditions.push(eq(reservations.distributorId, distributorId))
    if (from) conditions.push(gte(reservations.createdAt, fromDate(from)))
    if (to)   conditions.push(lt(reservations.createdAt, toDateExclusive(to)))
    if (auth.scope) conditions.push(eq(distributors.communeId, auth.scope.communeId))
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

  /**
   * GET /v1/admin/reservations/export.csv — export complet, mêmes filtres
   * que la liste mais sans pagination (limite dure 10k pour mémoire).
   * BOM UTF-8 + RFC 4180 pour ouverture clean dans Excel/Sheets/Numbers.
   */
  app.get('/export.csv', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Réservations'],
      summary: 'Export CSV des réservations',
      description: '**Réponse non-JSON** : `Content-Type: text/csv; charset=utf-8` avec BOM UTF-8 + CRLF (RFC 4180). '
        + 'Limite dure 10 000 lignes. Mêmes filtres que la liste (status, distributorId, from, to) mais pas de pagination. '
        + 'Le filename intègre la fenêtre demandée : `reservations-2026-05-01_2026-05-19.csv`.\n\n'
        + 'Colonnes : id, created_at, status, user_email, user_name, distributor_name, distributor_serial, '
        + 'item_type, expires_at, opened_at, due_at, returned_at, extension_count, cancellation_reason.',
      security: [{ bearerAuth: [] }],
      querystring: ExportQuery,
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const { status, distributorId, from, to } = req.query

    const conditions = []
    if (status) conditions.push(eq(reservations.status, status))
    if (distributorId) conditions.push(eq(reservations.distributorId, distributorId))
    if (from) conditions.push(gte(reservations.createdAt, fromDate(from)))
    if (to)   conditions.push(lt(reservations.createdAt, toDateExclusive(to)))
    if (auth.scope) conditions.push(eq(distributors.communeId, auth.scope.communeId))

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
        cancellationReason: reservations.cancellationReason,
        userEmail: users.email,
        userDisplayName: users.displayName,
        distributorName: distributors.name,
        distributorSerial: distributors.serialNumber,
        itemTypeName: itemTypes.name,
      })
      .from(reservations)
      .innerJoin(users, eq(users.id, reservations.userId))
      .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
      .where(conditions.length > 0 ? and(...conditions) : sql`true`)
      .orderBy(desc(reservations.createdAt))
      .limit(10_000)

    const header = [
      'id',
      'created_at',
      'status',
      'user_email',
      'user_name',
      'distributor_name',
      'distributor_serial',
      'item_type',
      'expires_at',
      'opened_at',
      'due_at',
      'returned_at',
      'extension_count',
      'cancellation_reason',
    ].join(',')

    const lines = [header]
    for (const r of rows) {
      lines.push([
        csvCell(r.id),
        csvCell(r.createdAt.toISOString()),
        csvCell(r.status),
        csvCell(r.userEmail),
        csvCell(r.userDisplayName),
        csvCell(r.distributorName),
        csvCell(r.distributorSerial),
        csvCell(r.itemTypeName),
        csvCell(r.expiresAt.toISOString()),
        csvCell(r.openedAt?.toISOString() ?? null),
        csvCell(r.dueAt?.toISOString() ?? null),
        csvCell(r.returnedAt?.toISOString() ?? null),
        csvCell(r.extensionCount),
        csvCell(r.cancellationReason),
      ].join(','))
    }

    const csv = '﻿' + lines.join('\r\n')  // BOM UTF-8 + CRLF line endings RFC 4180

    // Le filename intègre la fenêtre demandée pour faciliter l'archivage côté commune.
    const todayIso = new Date().toISOString().slice(0, 10)
    const filename = from && to
      ? `reservations-${from}_${to}.csv`
      : from
      ? `reservations-from-${from}.csv`
      : to
      ? `reservations-until-${to}.csv`
      : `reservations-${todayIso}.csv`

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(csv)
  })

  /**
   * GET /v1/admin/reservations/:id — détail d'une réservation avec sa
   * timeline d'événements (locker_events) tri ASC pour reconstituer l'ordre
   * chronologique. Pour le drawer admin dashboard.
   */
  app.get('/:id', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Réservations'],
      summary: 'Détail réservation + timeline événements',
      description: 'Renvoie la réservation enrichie (user, distributeur, item) + sa timeline `locker_events` '
        + '(tri ASC). Pour le drawer admin. Un admin scopé hors commune reçoit 404 (pas 403).',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: ReservationDetailDTO,
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const detailWhere = auth.scope
      ? and(eq(reservations.id, req.params.id), eq(distributors.communeId, auth.scope.communeId))
      : eq(reservations.id, req.params.id)

    const [r] = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        openedAt: reservations.openedAt,
        returnedAt: reservations.returnedAt,
        dueAt: reservations.dueAt,
        extensionCount: reservations.extensionCount,
        cancellationReason: reservations.cancellationReason,
        qrJti: reservations.qrJti,
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
      .where(detailWhere)
      .limit(1)

    // Note : un operator hors scope reçoit 404 (pas 403) pour éviter de
    // confirmer l'existence d'une réservation dont il ne peut pas voir.
    if (!r) return reply.code(404).send({ error: 'reservation_not_found' })

    const events = await db
      .select({
        id: lockerEvents.id,
        eventType: lockerEvents.eventType,
        source: lockerEvents.source,
        metadata: lockerEvents.metadata,
        createdAt: lockerEvents.createdAt,
      })
      .from(lockerEvents)
      .where(eq(lockerEvents.reservationId, r.id))
      .orderBy(lockerEvents.createdAt)
      .limit(200)

    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      openedAt: r.openedAt?.toISOString() ?? null,
      returnedAt: r.returnedAt?.toISOString() ?? null,
      dueAt: r.dueAt?.toISOString() ?? null,
      extensionCount: r.extensionCount,
      cancellationReason: r.cancellationReason,
      qrJti: r.qrJti,
      user: { id: r.userId, email: r.userEmail, displayName: r.userDisplayName },
      distributor: { id: r.distributorId, name: r.distributorName, serialNumber: r.distributorSerial },
      item: { id: r.itemId, typeName: r.itemTypeName },
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        source: e.source,
        metadata: (e.metadata ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  })

  /**
   * POST /v1/admin/reservations/:id/force-cancel — annule en force depuis le
   * dashboard admin. Diffère du POST /:id/cancel user-facing :
   * - accepte 'pending' ET 'active' (le user-facing n'accepte que 'pending')
   * - cancellation_reason = 'admin_force_cancel'
   * - inscrit un locker_event avec source='admin'
   * - libère le locker associé (state='idle') si encore reserved/active
   */
  app.post('/:id/force-cancel', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Admin — Réservations'],
      summary: 'Annulation forcée (admin)',
      description: 'Diffère de `POST /v1/reservations/:id/cancel` (user-facing) :\n'
        + '- accepte `pending` ET `active` (le user-facing n\'accepte que `pending`)\n'
        + '- libère le casier (state=idle)\n'
        + '- inscrit un `locker_event` avec source=`admin`\n'
        + '- `cancellation_reason` = body.reason (sinon `admin_force_cancel`)\n\n'
        + '**Erreurs** : 404 `reservation_not_found` · 409 `reservation_already_terminal` (cancelled/expired/returned).\n\n'
        + '**Exemple body** : `{ "reason": "user_signaled_lost_phone" }`',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: z.object({
        reason: z.string().min(4).max(500).optional()
          .describe('Raison de l\'annulation (loggée dans cancellation_reason + metadata event)'),
      }).optional(),
      response: {
        200: ReservationDetailDTO,
        401: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return

    const reason = req.body?.reason ?? 'admin_force_cancel'
    const now = new Date()

    const result = await db.transaction(async (tx) => {
      // Pour un operator, on JOIN distributors pour vérifier le scope commune.
      // Pour un admin (scope=null), on évite le JOIN inutile.
      const baseQuery = auth.scope
        ? tx
            .select({ id: reservations.id, status: reservations.status, lockerId: reservations.lockerId })
            .from(reservations)
            .innerJoin(distributors, eq(distributors.id, reservations.distributorId))
            .where(and(
              eq(reservations.id, req.params.id),
              eq(distributors.communeId, auth.scope.communeId),
            ))
        : tx
            .select({ id: reservations.id, status: reservations.status, lockerId: reservations.lockerId })
            .from(reservations)
            .where(eq(reservations.id, req.params.id))

      const [existing] = await baseQuery.for('update').limit(1)

      if (!existing) return { kind: 'not_found' as const }

      // Déjà dans un état terminal — pas idempotent, on signale.
      if (
        existing.status === 'cancelled'
        || existing.status === 'expired'
        || existing.status === 'returned'
      ) {
        return { kind: 'already_terminal' as const }
      }

      await tx
        .update(reservations)
        .set({ status: 'cancelled', cancellationReason: reason, updatedAt: now })
        .where(eq(reservations.id, existing.id))

      // Libère le locker si encore réservé/actif (overdue inclus).
      await tx
        .update(lockers)
        .set({ state: 'idle', lastStateAt: now, updatedAt: now })
        .where(eq(lockers.id, existing.lockerId))

      await tx.insert(lockerEvents).values({
        lockerId: existing.lockerId,
        reservationId: existing.id,
        eventType: 'cancelled',
        source: 'admin',
        metadata: { reason },
      })

      return { kind: 'ok' as const, freedLockerId: existing.lockerId }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'already_terminal') {
      return reply.code(409).send({ error: 'reservation_already_terminal' })
    }

    // Casier libéré (force-cancel opérateur) → diffusion temps réel post-commit.
    await emitLockerChange({ db, log: req.log }, result.freedLockerId, 'cancelled')

    // Re-fetch via la route detail pour renvoyer le DTO complet (avec events updated)
    const [r] = await db
      .select({
        id: reservations.id,
        status: reservations.status,
        createdAt: reservations.createdAt,
        expiresAt: reservations.expiresAt,
        openedAt: reservations.openedAt,
        returnedAt: reservations.returnedAt,
        dueAt: reservations.dueAt,
        extensionCount: reservations.extensionCount,
        cancellationReason: reservations.cancellationReason,
        qrJti: reservations.qrJti,
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
      .where(eq(reservations.id, req.params.id))
      .limit(1)

    if (!r) return reply.code(404).send({ error: 'reservation_not_found' })

    const events = await db
      .select({
        id: lockerEvents.id,
        eventType: lockerEvents.eventType,
        source: lockerEvents.source,
        metadata: lockerEvents.metadata,
        createdAt: lockerEvents.createdAt,
      })
      .from(lockerEvents)
      .where(eq(lockerEvents.reservationId, r.id))
      .orderBy(lockerEvents.createdAt)
      .limit(200)

    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      openedAt: r.openedAt?.toISOString() ?? null,
      returnedAt: r.returnedAt?.toISOString() ?? null,
      dueAt: r.dueAt?.toISOString() ?? null,
      extensionCount: r.extensionCount,
      cancellationReason: r.cancellationReason,
      qrJti: r.qrJti,
      user: { id: r.userId, email: r.userEmail, displayName: r.userDisplayName },
      distributor: { id: r.distributorId, name: r.distributorName, serialNumber: r.distributorSerial },
      item: { id: r.itemId, typeName: r.itemTypeName },
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        source: e.source,
        metadata: (e.metadata ?? {}) as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  })
}
