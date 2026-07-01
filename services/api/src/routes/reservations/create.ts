/**
 * Routes de création de réservation : `POST /` (résa "immédiate" pending) et
 * `POST /slots` (résa "scheduled" sur créneau futur).
 *
 * Extraites de `routes/reservations.ts` (audit dette tech §2). Les deux
 * points d'entrée de création citoyens. Lock Redis SETNX + transactions
 * Drizzle + filet anti-monopole (1 résa "vivante" par user max, garantie par
 * l'index partiel unique idx_reservations_one_live_per_user).
 *
 * Registered comme sous-plugin Fastify par `reservations.ts` via
 * `app.register(reservationCreateRoutes)`.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { db } from '../../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, payments, pricingRules, reservations, tokenNonces,
} from '../../db/schema.js'
import { signDeviceToken } from '../../lib/jwt-device.js'
import { emitLockerChange } from '../../lib/live-emit.js'
import { isPgViolation, PG_ERRORS } from '../../lib/pg-errors.js'
import {
  computeSlotEnd, NO_SHOW_GRACE_MINUTES, validateSlotRequest,
} from '../../lib/slots.js'
import { redis } from '../../redis/client.js'

import {
  DEVICE_TOKEN_TTL_SEC,
  IDEMPOTENCY_TTL_SEC,
  LOCK_TTL_SEC,
  RESERVATION_TTL_MS,
  readIdempotencyKey,
  toDto,
} from './helpers.js'
import {
  CreateReservationBody,
  CreateSlotReservationBody,
  ErrorDTO,
  ReservationCreatedDTO,
  SlotReservationCreatedDTO,
} from './dtos.js'

export async function reservationCreateRoutes(rawApp: FastifyInstance) {
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
        + 'Émet un `nonce` anti-replay et un `deviceToken` (JWT HS256, exp 15min, jti=nonce) prêt à afficher en QR. '
        + 'Le firmware vérifie le JWT offline avec `JWT_DEVICE_SECRET`.\n\n'
        + 'Header optionnel `Idempotency-Key` : si fourni, la réponse est mise en cache 24h par (user, key) ; '
        + 'rejouer la même requête renvoie la même réponse sans créer de nouvelle réservation.\n\n'
        + '**Erreurs** :\n'
        + '- 404 `locker_not_found`\n'
        + '- 409 `already_active` (le user a déjà une réservation pending/active)\n'
        + '- 409 `locker_being_processed` (autre user en train de réserver)\n'
        + '- 409 `locker_not_available` (state ≠ idle ou aucun item)\n'
        + '- 409 `item_mismatch` (itemId fourni ≠ currentItemId du casier)\n'
        + '- 409 `commune_mismatch` (communeId ≠ commune du distributeur)',
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

    // Idempotency-Key : si la même clé arrive 2× (réseau flaky, retry app), on
    // renvoie la réponse cachée. Scope = par user pour éviter qu'une clé
    // devine collide entre utilisateurs.
    const idempKey = readIdempotencyKey(req.headers as Record<string, unknown>)
    const idempCacheKey = idempKey ? `idem:reservations:${userId}:${idempKey}` : null
    if (idempCacheKey) {
      const cached = await redis.get(idempCacheKey)
      if (cached) {
        try {
          // On ne cache que les 201 (cf. plus bas) ⇒ shape ReservationCreatedDTO.
          const parsed = JSON.parse(cached) as { status: 201; body: z.infer<typeof ReservationCreatedDTO> }
          return reply.code(parsed.status).send(parsed.body)
        } catch {
          // Cache corrompu — on poursuit comme si rien n'était caché.
        }
      }
    }

    const lockKey = `lock:locker:${lockerId}`
    const acquired = await redis.set(lockKey, userId, 'EX', LOCK_TTL_SEC, 'NX')
    if (acquired !== 'OK') {
      return reply.code(409).send({ error: 'locker_being_processed' })
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Garde "une seule réservation vivante par user" — première ligne de
        // défense (erreur métier propre). Le filet de sécurité est l'index
        // partiel unique idx_reservations_one_active_per_user (migration 0005)
        // capté plus bas dans le catch.
        const existingActive = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(and(
            eq(reservations.userId, userId),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
          ))
          .limit(1)
        if (existingActive.length > 0) {
          return { kind: 'already_active' as const }
        }

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
          return { kind: 'locker_not_found' as const }
        }

        const availabilityRows = await tx.execute<{ is_available: boolean }>(
          sql`SELECT fn_locker_is_available(${lockerId}::uuid) AS is_available`,
        )
        if (availabilityRows[0]?.is_available !== true) {
          return { kind: 'locker_not_available' as const }
        }

        if (locker.currentItemId !== itemId) {
          return { kind: 'item_mismatch' as const }
        }

        const [dist] = await tx
          .select({ communeId: distributors.communeId })
          .from(distributors)
          .where(eq(distributors.id, locker.distributorId))
          .limit(1)
        if (!dist || dist.communeId !== communeId) {
          return { kind: 'commune_mismatch' as const }
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

        return { kind: 'ok' as const, reservation: reservation!, nonce, distributorId: locker.distributorId }
      }).catch((err: unknown) => {
        // Race entre 2 POST simultanés du même user (lockers différents) :
        // le SELECT préalable peut voir "rien" mais l'INSERT viole l'index
        // partiel unique idx_reservations_one_live_per_user (migration 0008,
        // remplace 0005). On traite comme `already_active`.
        if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'one_live_per_user')) {
          return { kind: 'already_active' as const }
        }
        throw err
      })

      if (result.kind === 'locker_not_found') {
        return reply.code(404).send({ error: 'locker_not_found' })
      }
      if (result.kind === 'already_active') {
        return reply.code(409).send({ error: 'already_active' })
      }
      if (result.kind === 'locker_not_available') {
        return reply.code(409).send({ error: 'locker_not_available' })
      }
      if (result.kind === 'item_mismatch') {
        return reply.code(409).send({ error: 'item_mismatch' })
      }
      if (result.kind === 'commune_mismatch') {
        return reply.code(409).send({ error: 'commune_mismatch' })
      }

      // Casier passé en `reserved` → diffusion temps réel dashboard (post-commit).
      await emitLockerChange({ db, log: req.log }, lockerId, 'reserved')

      const deviceToken = await signDeviceToken({
        reservationId: result.reservation.id,
        lockerId,
        distributorId: result.distributorId,
      }, DEVICE_TOKEN_TTL_SEC, result.nonce)

      const body = { ...toDto(result.reservation), nonce: result.nonce, deviceToken }

      if (idempCacheKey) {
        await redis.set(
          idempCacheKey,
          JSON.stringify({ status: 201, body }),
          'EX',
          IDEMPOTENCY_TTL_SEC,
        )
      }

      return reply.code(201).send(body)
    } finally {
      await redis.del(lockKey)
    }
  })

  /**
   * POST /v1/reservations/slots — réserve un créneau futur (modèle slots).
   *
   * Pendant slot-aware de POST /v1/reservations (qui lui crée une résa
   * "immédiate" en `pending` et lock le casier). Ici on crée une résa
   * `scheduled` qui ne réserve PAS le casier physique : seul l'item est
   * snapshot. À slot_start_at, le user vient scanner et la résa transite
   * vers `active` (mécanique du firmware/check-in, hors scope PR 2).
   */
  app.post('/slots', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Réserve un créneau futur (modèle slots)',
      description: 'Crée une résa `pending_payment` sur la fenêtre [slotStartAt, slotStartAt + durationMinutes). '
        + 'L\'API choisit un item dispo du type demandé (snapshot) et fige le prix depuis `pricing_rules`. '
        + 'Le slot/item sont tenus mais AUCUN QR n\'est délivré tant que le paiement n\'a pas réussi : '
        + 'appeler ensuite `POST /:id/pay`, puis (stripe) attendre le webhook ou (simulate) '
        + '`POST /:id/pay/confirm-simulated`. À la réussite, la résa passe `scheduled` et le QR est servi par `GET /active`.\n\n'
        + 'Garde anti-monopole : 1 résa "vivante" max par user (pending_payment/scheduled/pending/active). '
        + 'Une résa `pending_payment` impayée est expirée par le cron après `PAYMENT_TTL_MINUTES`.\n\n'
        + '**Erreurs** :\n'
        + '- 404 `distributor_not_found`\n'
        + '- 409 `already_active` (le user a déjà une résa vivante)\n'
        + '- 409 `slot_not_available` (aucun item libre sur le slot)\n'
        + '- 409 `slot_being_processed` (autre user en train de réserver le même slot)\n'
        + '- 422 `slot_not_aligned` / `slot_in_past` / `slot_too_far` / `slot_outside_opening_hours` / `duration_not_allowed`\n'
        + '- 422 `no_pricing` (pas de pricing_rule pour ce triplet — tenant non configuré)',
      security: [{ bearerAuth: [] }],
      body: CreateSlotReservationBody,
      response: {
        201: SlotReservationCreatedDTO,
        404: ErrorDTO,
        409: ErrorDTO,
        422: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { distributorId, itemTypeId, slotStartAt: slotStartAtStr, durationMinutes } = req.body

    const slotStartAt = new Date(slotStartAtStr)
    const validation = validateSlotRequest({ slotStartAt, durationMinutes })
    if (validation !== null) return reply.code(422).send({ error: validation })

    const slotEndAt = computeSlotEnd(slotStartAt, durationMinutes)

    const [dist] = await db
      .select({ id: distributors.id, communeId: distributors.communeId })
      .from(distributors)
      .where(eq(distributors.id, distributorId))
      .limit(1)
    if (!dist) return reply.code(404).send({ error: 'distributor_not_found' })

    // Tarif (commune × item_type × duration). Pas de règle = créneau non
    // proposé pour ce sport dans cette commune.
    const [price] = await db
      .select({ priceCents: pricingRules.priceCents })
      .from(pricingRules)
      .where(and(
        eq(pricingRules.communeId, dist.communeId),
        eq(pricingRules.itemTypeId, itemTypeId),
        eq(pricingRules.durationMinutes, durationMinutes),
      ))
      .limit(1)
    if (!price) return reply.code(422).send({ error: 'no_pricing' })

    // Sérialise les booking concurrents sur le même créneau. Évite que deux
    // citoyens grabbent le dernier item du type au même moment.
    const slotIso = slotStartAt.toISOString()
    const lockKey = `lock:slot:${distributorId}:${itemTypeId}:${slotIso}:${durationMinutes}`
    const acquired = await redis.set(lockKey, userId, 'EX', LOCK_TTL_SEC, 'NX')
    if (acquired !== 'OK') return reply.code(409).send({ error: 'slot_being_processed' })

    try {
      const result = await db.transaction(async (tx) => {
        // Anti-monopole : 1 résa vivante max par user. SELECT préalable +
        // filet via l'index partiel unique (catché dans le .catch en sortie).
        const existing = await tx
          .select({ id: reservations.id })
          .from(reservations)
          .where(and(
            eq(reservations.userId, userId),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
          ))
          .limit(1)
        if (existing.length > 0) return { kind: 'already_active' as const }

        // Items du type sur ce distributeur.
        const candidates = await tx
          .select({ id: items.id, lockerId: lockers.id })
          .from(items)
          .innerJoin(lockers, eq(items.currentLockerId, lockers.id))
          .where(and(
            eq(lockers.distributorId, distributorId),
            eq(items.itemTypeId, itemTypeId),
          ))
        if (candidates.length === 0) return { kind: 'slot_not_available' as const }

        // Items déjà occupés par une résa qui overlap [slotStartAt, slotEndAt).
        const busy = await tx
          .select({ itemId: reservations.itemId })
          .from(reservations)
          .where(and(
            inArray(reservations.itemId, candidates.map((c) => c.id)),
            inArray(reservations.status, ['scheduled', 'pending', 'active']),
            sql`${reservations.slotStartAt} IS NOT NULL`,
            sql`${reservations.slotEndAt} IS NOT NULL`,
            lt(reservations.slotStartAt, slotEndAt),
            gt(reservations.slotEndAt, slotStartAt),
          ))
        const busyIds = new Set(busy.map((b) => b.itemId))
        const free = candidates.find((c) => !busyIds.has(c.id))
        if (!free) return { kind: 'slot_not_available' as const }

        const nonce = randomUUID()
        // Le QR est valable jusqu'à la fin du slot + la fenêtre de grâce
        // no-show — au-delà, le cron expire la résa et le firmware refusera
        // de toute façon (token expiré). On garde la `expires_at` du modèle
        // legacy pour la cohérence des cron existants, mais c'est en
        // pratique une bound supérieure de l'usage.
        const qrExpiresAt = new Date(slotEndAt.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000)

        const [reservation] = await tx
          .insert(reservations)
          .values({
            userId,
            lockerId: free.lockerId,
            itemId: free.id,
            distributorId,
            status: 'pending_payment',
            qrJti: nonce,
            expiresAt: qrExpiresAt,
            slotStartAt,
            slotEndAt,
            durationMinutes,
            priceCents: price.priceCents,
          })
          .returning()

        await tx.insert(tokenNonces).values({
          nonce,
          reservationId: reservation!.id,
          distributorId,
        })

        // Paiement à régler avant que la résa ne devienne `scheduled`. Le
        // provider est figé selon l'env au moment de la création : un paiement
        // créé en `simulate` reste confirmable en simulate même si l'API passe
        // en stripe entre-temps.
        const [payment] = await tx
          .insert(payments)
          .values({
            reservationId: reservation!.id,
            userId,
            amountCents: price.priceCents,
            currency: 'EUR',
            provider: env.PAYMENTS_PROVIDER,
            status: 'pending',
          })
          .returning()

        await tx.insert(lockerEvents).values({
          lockerId: free.lockerId,
          reservationId: reservation!.id,
          eventType: 'reserved',
          source: 'api',
          metadata: {
            slotStartAt: slotStartAt.toISOString(),
            slotEndAt: slotEndAt.toISOString(),
            durationMinutes,
            priceCents: price.priceCents,
            mode: 'slot',
          },
        })

        return {
          kind: 'ok' as const,
          reservation: reservation!,
          payment: payment!,
          nonce,
          qrExpiresAt,
        }
      }).catch((err: unknown) => {
        if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'one_live_per_user')) {
          return { kind: 'already_active' as const }
        }
        throw err
      })

      if (result.kind === 'already_active') {
        return reply.code(409).send({ error: 'already_active' })
      }
      if (result.kind === 'slot_not_available') {
        return reply.code(409).send({ error: 'slot_not_available' })
      }

      // Pas de deviceToken ici : le QR n'est délivré (par GET /active) qu'une
      // fois la résa passée `scheduled`, c.-à-d. après paiement réussi.
      return reply.code(201).send({
        ...toDto(result.reservation),
        slotStartAt: result.reservation.slotStartAt!.toISOString(),
        slotEndAt: result.reservation.slotEndAt!.toISOString(),
        durationMinutes: result.reservation.durationMinutes!,
        priceCents: result.reservation.priceCents!,
        payment: {
          id: result.payment.id,
          amountCents: result.payment.amountCents,
          currency: result.payment.currency,
          provider: result.payment.provider as 'stripe' | 'simulate',
          status: result.payment.status,
        },
      })
    } finally {
      await redis.del(lockKey)
    }
  })
}
