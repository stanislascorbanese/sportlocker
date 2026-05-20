import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, reservations, tokenNonces,
} from '../db/schema.js'
import { redis } from '../redis/client.js'

const RESERVATION_TTL_MS = 15 * 60 * 1000
const LOCK_TTL_SEC = 30
const MAX_EXTENSIONS = 2

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const CreateReservationBody = z.object({
  lockerId: z.string().uuid().describe('UUID du casier ciblé (scanné via QR ou choisi depuis l\'app)'),
  itemId: z.string().uuid().describe('UUID de l\'item physique présent dans le casier (doit matcher `currentItemId`)'),
  communeId: z.string().uuid().describe('Tenant du distributeur (cohérence avec le scope de l\'app)'),
})

const ReturnReservationBody = z.object({
  returnLockerId: z.string().uuid().describe('Casier où l\'item est rendu (peut différer du casier d\'emprunt)'),
  returnDistributorId: z.string().uuid().describe('Distributeur correspondant au returnLockerId'),
})

const ReservationBaseDTO = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'])
    .describe('État machine : pending → active → returned (nominal). overdue/cancelled/expired = terminal.'),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  expiresAt: z.string().datetime().describe('TTL de la réservation pending (15min). Auto-expire au-delà.'),
  dueAt: z.string().datetime().nullable().describe('Échéance de retour (active). Null tant que pending.'),
  extensionCount: z.number().int().min(0).describe('Nombre de prolongations utilisées (max 2)'),
})
const ReservationCreatedDTO = ReservationBaseDTO.extend({
  nonce: z.string().uuid().describe('Nonce anti-replay à embarquer dans le JWT QR. Usage unique côté firmware.'),
})

const ErrorDTO = z.object({ error: z.string() })

type ReservationRow = typeof reservations.$inferSelect

function toDto(r: ReservationRow) {
  return {
    id: r.id,
    status: r.status,
    lockerId: r.lockerId,
    itemId: r.itemId,
    distributorId: r.distributorId,
    expiresAt: r.expiresAt.toISOString(),
    dueAt: r.dueAt?.toISOString() ?? null,
    extensionCount: r.extensionCount,
  }
}

export async function reservationRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/reservations — réserve un casier et émet un nonce QR.
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réserve un casier (citoyen)',
      description: 'Verrouille le casier (Redis SETNX TTL 30s) puis crée la réservation en transaction. '
        + 'Émet un `nonce` anti-replay à inclure dans le JWT QR généré côté app pour l\'unlock offline.\n\n'
        + '**Erreurs** :\n'
        + '- 404 `locker_not_found`\n'
        + '- 409 `locker_being_processed` (autre user en train de réserver)\n'
        + '- 409 `locker_not_available` (state ≠ idle ou aucun item)\n'
        + '- 409 `item_mismatch` (itemId fourni ≠ currentItemId du casier)\n'
        + '- 409 `commune_mismatch` (communeId ≠ commune du distributeur)\n\n'
        + '**Exemple body** : `{ "lockerId": "8e7…", "itemId": "1a2…", "communeId": "9f0…" }`\n\n'
        + '**Exemple réponse 201** : `{ "id":"…", "status":"pending", "expiresAt":"2026-05-19T14:45:00.000Z", '
        + '"nonce":"…" }`',
      security: [{ bearerAuth: [] }],
      body: CreateReservationBody,
      response: {
        201: ReservationCreatedDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { lockerId, itemId, communeId } = req.body

    const lockKey = `lock:locker:${lockerId}`
    const acquired = await redis.set(lockKey, userId, 'EX', LOCK_TTL_SEC, 'NX')
    if (acquired !== 'OK') {
      return reply.code(409).send({ error: 'locker_being_processed' })
    }

    try {
      return await db.transaction(async (tx) => {
        const [locker] = await tx
          .select({
            id: lockers.id,
            distributorId: lockers.distributorId,
            currentItemId: lockers.currentItemId,
          })
          .from(lockers)
          .where(eq(lockers.id, lockerId))
          .limit(1)

        if (!locker) {
          return reply.code(404).send({ error: 'locker_not_found' })
        }

        const availabilityRows = await tx.execute<{ is_available: boolean }>(
          sql`SELECT fn_locker_is_available(${lockerId}::uuid) AS is_available`,
        )
        if (availabilityRows[0]?.is_available !== true) {
          return reply.code(409).send({ error: 'locker_not_available' })
        }

        if (locker.currentItemId !== itemId) {
          return reply.code(409).send({ error: 'item_mismatch' })
        }

        const [dist] = await tx
          .select({ communeId: distributors.communeId })
          .from(distributors)
          .where(eq(distributors.id, locker.distributorId))
          .limit(1)
        if (!dist || dist.communeId !== communeId) {
          return reply.code(409).send({ error: 'commune_mismatch' })
        }

        const nonce = randomUUID()
        const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS)
        const now = new Date()

        const [reservation] = await tx
          .insert(reservations)
          .values({
            userId,
            lockerId,
            itemId,
            distributorId: locker.distributorId,
            status: 'pending',
            qrJti: nonce,
            expiresAt,
          })
          .returning()

        await tx.insert(tokenNonces).values({
          nonce,
          reservationId: reservation!.id,
          distributorId: locker.distributorId,
        })

        await tx
          .update(lockers)
          .set({ state: 'reserved', lastStateAt: now, updatedAt: now })
          .where(eq(lockers.id, lockerId))

        await tx.insert(lockerEvents).values({
          lockerId,
          reservationId: reservation!.id,
          eventType: 'reserved',
          source: 'api',
        })

        return reply.code(201).send({ ...toDto(reservation!), nonce })
      })
    } finally {
      await redis.del(lockKey)
    }
  })

  /**
   * GET /v1/reservations/me — historique de l'utilisateur courant.
   */
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Historique du citoyen courant',
      description: 'Renvoie les 50 dernières réservations du user authentifié (statuts pending/active/returned/overdue).',
      security: [{ bearerAuth: [] }],
      response: { 200: z.object({ items: z.array(ReservationBaseDTO) }) },
    },
  }, async (req) => {
    const rows = await db
      .select()
      .from(reservations)
      .where(and(eq(reservations.userId, req.user.sub), inArray(reservations.status, [
        'pending', 'active', 'returned', 'overdue',
      ])))
      .orderBy(reservations.createdAt)
      .limit(50)

    return { items: rows.map(toDto) }
  })

  /**
   * POST /v1/reservations/:id/cancel — annule avant ouverture.
   */
  app.post('/:id/cancel', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Annule une réservation pending',
      description: 'Réservé au statut `pending` (le casier n\'a pas encore été ouvert). '
        + 'Pour une annulation en cours d\'usage, voir `POST /v1/admin/reservations/:id/force-cancel` côté admin.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: z.object({ ok: z.literal(true) }), 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const updated = await db
      .update(reservations)
      .set({ status: 'cancelled', cancellationReason: 'user_cancel', updatedAt: new Date() })
      .where(and(
        eq(reservations.id, req.params.id),
        eq(reservations.userId, req.user.sub),
        eq(reservations.status, 'pending'),
      ))
      .returning({ id: reservations.id, lockerId: reservations.lockerId })

    if (updated.length === 0) return reply.code(404).send({ error: 'reservation_not_cancellable' })

    await db.update(lockers)
      .set({ state: 'idle', lastStateAt: new Date(), updatedAt: new Date() })
      .where(eq(lockers.id, updated[0]!.lockerId))

    return { ok: true as const }
  })

  /**
   * POST /v1/reservations/:id/return — confirme le retour d'un item.
   */
  app.post('/:id/return', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Confirme le retour d\'un item',
      description: 'Accepte statuts `active` (retour dans les temps) ET `overdue` (retour hors délai). '
        + 'Le flag `wasOverdue` permet au client d\'afficher un toast adapté. Libère le casier d\'emprunt initial.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: ReturnReservationBody,
      response: {
        200: ReservationBaseDTO.extend({
          wasOverdue: z.boolean().describe('True si le retour intervient après dueAt (status="overdue" au moment du retour)'),
        }),
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params
    const { returnLockerId, returnDistributorId } = req.body
    const now = new Date()

    const result = await db.transaction(async (tx: DbTx) => {
      const [existing] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .limit(1)

      if (!existing || existing.userId !== userId) {
        return { kind: 'not_found' as const }
      }
      // Accepte 'active' (retour dans les temps) ET 'overdue' (retour hors délai).
      // Le client distingue via le status renvoyé : 'returned' vs le wasOverdue ci-dessous.
      const wasOverdue = existing.status === 'overdue'
      if (existing.status !== 'active' && !wasOverdue) {
        return { kind: 'not_returnable' as const }
      }

      const [updated] = await tx
        .update(reservations)
        .set({
          status: 'returned',
          returnedAt: now,
          returnLockerId,
          returnDistributorId,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning()

      await tx.update(lockers)
        .set({ state: 'idle', lastStateAt: now, updatedAt: now })
        .where(eq(lockers.id, existing.lockerId))

      await tx.insert(lockerEvents).values({
        lockerId: returnLockerId,
        reservationId: id,
        eventType: 'returned',
        source: 'api',
      })

      return { kind: 'ok' as const, reservation: updated!, wasOverdue }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_returnable') {
      return reply.code(409).send({ error: 'reservation_not_returnable' })
    }

    return reply.code(200).send({ ...toDto(result.reservation), wasOverdue: result.wasOverdue })
  })

  /**
   * PATCH /v1/reservations/:id/extend — prolonge l'emprunt actif.
   *
   * Règles métier :
   *   - réservation appartient à l'utilisateur courant (sinon 404)
   *   - status = 'active' (sinon 409 reservation_not_extendable)
   *   - extension_count < 2 (sinon 409 max_extensions_reached)
   *   - aucune autre résa pending/active sur le même locker (sinon 409 locker_conflict)
   *
   * Calcul : new_due_at = due_at + item_types.max_duration_minutes.
   * Transaction PG avec SELECT FOR UPDATE pour sérialiser deux PATCH concurrents.
   */
  app.patch('/:id/extend', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Prolonge un emprunt actif',
      description: 'Max 2 prolongations. Ajoute `item_types.max_duration_minutes` à `due_at`. '
        + 'Erreurs : 409 `reservation_not_extendable` (status ≠ active), 409 `max_extensions_reached`, '
        + '409 `locker_conflict` (autre résa pending/active sur le même casier).',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: ReservationBaseDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const result = await db.transaction(async (tx: DbTx) => {
      const [r] = await tx
        .select()
        .from(reservations)
        .where(eq(reservations.id, id))
        .for('update')
        .limit(1)

      if (!r || r.userId !== userId) return { kind: 'not_found' as const }
      if (r.status !== 'active' || !r.dueAt) {
        return { kind: 'not_extendable' as const }
      }
      if (r.extensionCount >= MAX_EXTENSIONS) {
        return { kind: 'max_reached' as const }
      }

      // Conflit : une autre réservation pending/active sur le même casier.
      // En régime nominal personne d'autre ne peut être pending/active sur ce
      // locker (state machine), mais on garde la vérif comme garde-fou.
      const conflicts = await tx
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(
          eq(reservations.lockerId, r.lockerId),
          ne(reservations.id, id),
          inArray(reservations.status, ['pending', 'active']),
        ))
        .limit(1)
      if (conflicts.length > 0) return { kind: 'locker_conflict' as const }

      const [itemInfo] = await tx
        .select({ maxDurationMinutes: itemTypes.maxDurationMinutes })
        .from(items)
        .innerJoin(itemTypes, eq(itemTypes.id, items.itemTypeId))
        .where(eq(items.id, r.itemId))
        .limit(1)
      if (!itemInfo) return { kind: 'item_type_missing' as const }

      const newDueAt = new Date(r.dueAt.getTime() + itemInfo.maxDurationMinutes * 60 * 1000)
      const newExtensionCount = r.extensionCount + 1
      const now = new Date()

      const [updated] = await tx
        .update(reservations)
        .set({
          dueAt: newDueAt,
          extensionCount: newExtensionCount,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning()

      await tx.insert(lockerEvents).values({
        lockerId: r.lockerId,
        reservationId: id,
        eventType: 'extended',
        source: 'api',
        metadata: {
          newDueAt: newDueAt.toISOString(),
          extensionCount: newExtensionCount,
          addedMinutes: itemInfo.maxDurationMinutes,
        },
      })

      return { kind: 'ok' as const, reservation: updated! }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_extendable') {
      return reply.code(409).send({ error: 'reservation_not_extendable' })
    }
    if (result.kind === 'max_reached') {
      return reply.code(409).send({ error: 'max_extensions_reached' })
    }
    if (result.kind === 'locker_conflict') {
      return reply.code(409).send({ error: 'locker_conflict' })
    }
    if (result.kind === 'item_type_missing') {
      return reply.code(409).send({ error: 'item_type_missing' })
    }

    return reply.code(200).send(toDto(result.reservation))
  })
}
