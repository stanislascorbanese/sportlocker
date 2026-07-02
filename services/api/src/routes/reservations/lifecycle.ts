/**
 * Routes de cycle de vie d'une réservation : `POST /:id/cancel`,
 * `POST /:id/return`, `PATCH /:id/extend`.
 *
 * Extraites de `routes/reservations.ts` (audit dette tech §2). Les trois
 * transitions terminales (ou quasi-terminales) qu'un citoyen peut déclencher
 * sur sa réservation après création. Toutes encapsulées en transactions
 * Drizzle pour garantir l'atomicité avec les effets sur `lockers`,
 * `locker_events` et `payments`.
 *
 * Registered comme sous-plugin Fastify par `reservations.ts` via
 * `app.register(reservationLifecycleRoutes)`.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/client.js'
import {
  itemTypes, items, lockerEvents, lockers, payments, reservations,
} from '../../db/schema.js'
import { emitLockerChange } from '../../lib/live-emit.js'

import {
  CANCEL_CUTOFF_MIN, MAX_EXTENSIONS, toDto, type DbTx,
} from './helpers.js'
import {
  ErrorDTO, ReservationBaseDTO, ReturnReservationBody,
} from './dtos.js'

export async function reservationLifecycleRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/reservations/:id/cancel — annule avant ouverture.
   *
   * Modes :
   *   - `pending`   : cancel à tout moment avant le scan firmware (legacy).
   *                   Le casier est libéré (state→idle).
   *   - `scheduled` : cancel jusqu'à `CANCEL_CUTOFF_MIN` minutes avant
   *                   `slotStartAt`. Au-delà, refus 409 `too_late_to_cancel`
   *                   pour laisser à l'opérateur le temps d'anticiper.
   *                   Pas de libération de casier (rien n'était réservé physiquement).
   */
  app.post('/:id/cancel', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Annule une réservation pending_payment, pending ou scheduled',
      description: `Accepte les statuts \`pending_payment\` (paiement non réglé), \`pending\` (legacy immédiat) et \`scheduled\` (slot futur). `
        + `Pour \`scheduled\`, refuse 409 \`too_late_to_cancel\` si \`slotStartAt - now < ${CANCEL_CUTOFF_MIN} min\`. `
        + 'Pour une annulation en cours d\'usage (status `active`), voir `POST /v1/admin/reservations/:id/force-cancel` côté admin.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: z.object({ ok: z.literal(true) }),
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    // On calcule le résultat DANS la transaction mais on n'envoie la réponse
    // qu'APRÈS le commit. Appeler `reply.send()` à l'intérieur du callback
    // flushait la réponse 200 avant que drizzle n'émette `COMMIT` : un client
    // (ou un test relisant la résa sur une autre connexion) pouvait alors voir
    // l'ancien statut `pending` juste après avoir reçu `{ ok: true }`.
    type CancelResult =
      | { code: 200; body: { ok: true }; freedLockerId?: string | undefined }
      | { code: 404 | 409; body: { error: string } }

    const result = await db.transaction(async (tx: DbTx): Promise<CancelResult> => {
      const [existing] = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          lockerId: reservations.lockerId,
          slotStartAt: reservations.slotStartAt,
        })
        .from(reservations)
        .where(and(eq(reservations.id, id), eq(reservations.userId, userId)))
        .limit(1)

      if (!existing) {
        return { code: 404, body: { error: 'reservation_not_cancellable' } }
      }
      const cancellable = ['pending_payment', 'pending', 'scheduled']
      if (!cancellable.includes(existing.status)) {
        return { code: 409, body: { error: 'reservation_not_cancellable' } }
      }
      if (existing.status === 'scheduled' && existing.slotStartAt) {
        const minutesUntilStart = (existing.slotStartAt.getTime() - Date.now()) / 60_000
        if (minutesUntilStart < CANCEL_CUTOFF_MIN) {
          return { code: 409, body: { error: 'too_late_to_cancel' } }
        }
      }

      await tx
        .update(reservations)
        .set({ status: 'cancelled', cancellationReason: 'user_cancel', updatedAt: new Date() })
        .where(eq(reservations.id, id))

      // Annule aussi le paiement en attente le cas échéant (résa jamais payée).
      // No-op si le paiement est déjà succeeded/failed (filtre sur 'pending').
      if (existing.status === 'pending_payment') {
        await tx.update(payments)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(payments.reservationId, id), eq(payments.status, 'pending')))
      }

      // Le casier physique n'est lock que pour les résas `pending`
      // (POST /v1/reservations). Les `scheduled`/`pending_payment` ne réservent
      // que l'item (snapshot) — le casier reste idle.
      const freedLockerId = existing.status === 'pending' ? existing.lockerId : undefined
      if (freedLockerId) {
        await tx.update(lockers)
          .set({ state: 'idle', lastStateAt: new Date(), updatedAt: new Date() })
          .where(eq(lockers.id, freedLockerId))
      }

      return { code: 200, body: { ok: true as const }, freedLockerId }
    })

    // Casier libéré (résa `pending` annulée) → diffusion temps réel post-commit.
    if (result.code === 200 && result.freedLockerId) {
      await emitLockerChange({ db, log: req.log }, result.freedLockerId, 'cancelled')
    }

    return reply.code(result.code).send(result.body)
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

      return { kind: 'ok' as const, reservation: updated!, wasOverdue, freedLockerId: existing.lockerId }
    })

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_returnable') {
      return reply.code(409).send({ error: 'reservation_not_returnable' })
    }

    // Casier d'emprunt repassé `idle` → diffusion temps réel post-commit.
    await emitLockerChange({ db, log: req.log }, result.freedLockerId, 'returned')

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
