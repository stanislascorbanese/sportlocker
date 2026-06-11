import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import {
  distributors, itemTypes, items, lockerEvents, lockers, payments, pricingRules, reservations, tokenNonces,
} from '../db/schema.js'
import { signDeviceToken } from '../lib/jwt-device.js'
import { markPaymentSucceeded } from '../lib/payments.js'
import { getWalletBalanceCents } from '../lib/wallet.js'
import { isPgViolation, PG_ERRORS } from '../lib/pg-errors.js'
import {
  computeSlotEnd, NO_SHOW_GRACE_MINUTES, validateSlotRequest,
} from '../lib/slots.js'
import { requireStripe } from '../lib/stripe.js'
import { redis } from '../redis/client.js'

import {
  CANCEL_CUTOFF_MIN,
  DEVICE_TOKEN_TTL_SEC,
  IDEMPOTENCY_TTL_SEC,
  LOCK_TTL_SEC,
  MAX_EXTENSIONS,
  RESERVATION_TTL_MS,
  readIdempotencyKey,
  toDto,
  type DbTx,
} from './reservations/helpers.js'
import {
  CreateReservationBody,
  CreateSlotReservationBody,
  ErrorDTO,
  PaymentIntentDTO,
  ReservationBaseDTO,
  ReservationCreatedDTO,
  ReturnReservationBody,
  SimulatedConfirmDTO,
  SlotReservationCreatedDTO,
  WalletPayDTO,
} from './reservations/dtos.js'
import { reservationViewsRoutes } from './reservations/views.js'


export async function reservationRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  // Les routes read-only (GET /active + GET /me) sont enregistrées en
  // sous-plugin pour rester isolées de la logique transactionnelle du reste
  // du fichier. Cf. routes/reservations/views.ts.
  await app.register(reservationViewsRoutes)

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

  /**
   * POST /v1/reservations/:id/pay — initialise le paiement de la location.
   *
   * - `stripe`   : crée (ou réutilise) un PaymentIntent et renvoie son
   *   `clientSecret` pour Stripe.js. Idempotent : un 2e appel retrouve le PI
   *   existant via `stripe_payment_intent_id`.
   * - `simulate` : aucun appel Stripe, renvoie `clientSecret: null`. Le client
   *   enchaîne sur `POST /:id/pay/confirm-simulated`.
   *
   * Réservé au propriétaire de la résa, qui doit être en `pending_payment`.
   */
  app.post('/:id/pay', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Initialise le paiement d\'une location (PaymentIntent Stripe ou simulate)',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: PaymentIntentDTO,
        403: ErrorDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const [pay] = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        status: payments.status,
        provider: payments.provider,
        amountCents: payments.amountCents,
        currency: payments.currency,
        reservationId: payments.reservationId,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        reservationStatus: reservations.status,
      })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(eq(payments.reservationId, id))
      .limit(1)

    if (!pay) return reply.code(404).send({ error: 'payment_not_found' })
    if (pay.userId !== userId) return reply.code(403).send({ error: 'forbidden' })
    if (pay.status === 'succeeded') return reply.code(409).send({ error: 'already_paid' })
    if (pay.reservationStatus !== 'pending_payment') {
      return reply.code(409).send({ error: 'reservation_not_payable' })
    }

    if (pay.provider === 'simulate') {
      return reply.code(200).send({
        paymentId: pay.id,
        provider: 'simulate' as const,
        status: pay.status,
        clientSecret: null,
      })
    }

    // Provider stripe : crée le PaymentIntent au 1er appel, le réutilise ensuite.
    const stripe = requireStripe()
    let clientSecret: string | null
    if (pay.stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(pay.stripePaymentIntentId)
      clientSecret = pi.client_secret
    } else {
      const pi = await stripe.paymentIntents.create({
        amount: pay.amountCents,
        currency: pay.currency.toLowerCase(),
        metadata: { paymentId: pay.id, reservationId: pay.reservationId, userId },
        // Affiche les moyens de paiement populaires activés sur le compte Stripe
        // (carte + Apple/Google Pay + Link + PayPal), ordonnés et filtrés par
        // Stripe selon l'appareil/montant. La curation (activer PayPal,
        // désactiver Revolut/UnionPay/etc.) se fait dans le dashboard Stripe.
        // Robuste : un moyen non activé sur le compte est simplement masqué,
        // sans faire échouer la création du PaymentIntent.
        automatic_payment_methods: { enabled: true },
      }, { idempotencyKey: `pay_${pay.id}` })
      clientSecret = pi.client_secret
      await db
        .update(payments)
        .set({ stripePaymentIntentId: pi.id, updatedAt: new Date() })
        .where(eq(payments.id, pay.id))
    }

    return reply.code(200).send({
      paymentId: pay.id,
      provider: 'stripe' as const,
      status: pay.status,
      clientSecret,
    })
  })

  /**
   * POST /v1/reservations/:id/pay/confirm-simulated — confirme un paiement
   * simulé (dev/staging sans Stripe). Réservé aux paiements `provider=simulate`.
   *
   * En prod (PAYMENTS_PROVIDER=stripe), les paiements naissent avec
   * provider=stripe, donc cet endpoint renvoie 409 `not_simulated` : pas de
   * porte dérobée pour valider un vrai paiement sans passer par Stripe.
   */
  app.post('/:id/pay/confirm-simulated', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Confirme un paiement simulé → bascule la résa en scheduled',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: SimulatedConfirmDTO,
        403: ErrorDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const [pay] = await db
      .select({
        id: payments.id,
        userId: payments.userId,
        provider: payments.provider,
        status: payments.status,
      })
      .from(payments)
      .where(eq(payments.reservationId, id))
      .limit(1)

    if (!pay) return reply.code(404).send({ error: 'payment_not_found' })
    if (pay.userId !== userId) return reply.code(403).send({ error: 'forbidden' })
    if (pay.provider !== 'simulate') return reply.code(409).send({ error: 'not_simulated' })

    const res = await markPaymentSucceeded(pay.id, app.log)
    if (res.kind === 'not_found') return reply.code(404).send({ error: 'payment_not_found' })
    if (res.kind === 'reservation_not_pending') {
      return reply.code(409).send({ error: 'reservation_not_payable' })
    }

    const [row] = await db
      .select({ paymentStatus: payments.status, reservationStatus: reservations.status })
      .from(payments)
      .innerJoin(reservations, eq(reservations.id, payments.reservationId))
      .where(eq(payments.id, pay.id))
      .limit(1)

    return reply.code(200).send({
      paymentStatus: row!.paymentStatus,
      reservationStatus: row!.reservationStatus,
    })
  })

  /**
   * POST /v1/reservations/:id/pay/wallet — règle la location avec le SOLDE du
   * porte-monnaie prépayé (aucun appel Stripe → aucun frais de transaction).
   *
   * Le paiement de la résa est marqué `provider='wallet'`, `succeeded`, et la
   * résa bascule `pending_payment → scheduled`. Tout est fait dans une seule
   * transaction protégée par un advisory lock par-user (anti double-dépense
   * concurrente). 402 si le solde est insuffisant.
   */
  app.post('/:id/pay/wallet', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Règle une location avec le porte-monnaie → scheduled',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: {
        200: WalletPayDTO,
        402: ErrorDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const result = await db.transaction(async (tx) => {
      // Verrou par-user : sérialise les dépenses wallet concurrentes du même
      // user (le solde n'a pas de ligne unique à verrouiller). Libéré au commit.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`)

      const [pay] = await tx
        .select({
          id: payments.id,
          userId: payments.userId,
          status: payments.status,
          amountCents: payments.amountCents,
          reservationStatus: reservations.status,
        })
        .from(payments)
        .innerJoin(reservations, eq(reservations.id, payments.reservationId))
        .where(eq(payments.reservationId, id))
        .limit(1)

      if (!pay) return { code: 404 as const, error: 'payment_not_found' }
      if (pay.userId !== userId) return { code: 403 as const, error: 'forbidden' }
      if (pay.status === 'succeeded') return { code: 409 as const, error: 'already_paid' }
      if (pay.reservationStatus !== 'pending_payment') {
        return { code: 409 as const, error: 'reservation_not_payable' }
      }

      const balance = await getWalletBalanceCents(userId, tx)
      if (balance < pay.amountCents) {
        return { code: 402 as const, error: 'insufficient_balance' }
      }

      const now = new Date()
      await tx
        .update(payments)
        .set({ provider: 'wallet', status: 'succeeded', paidAt: now, errorMessage: null, updatedAt: now })
        .where(eq(payments.id, pay.id))

      const flipped = await tx
        .update(reservations)
        .set({ status: 'scheduled', updatedAt: now })
        .where(and(eq(reservations.id, id), eq(reservations.status, 'pending_payment')))
        .returning({ id: reservations.id })
      if (flipped.length === 0) return { code: 409 as const, error: 'reservation_not_payable' }

      return { code: 200 as const, balanceCents: balance - pay.amountCents }
    })

    if (result.code !== 200) {
      return reply.code(result.code).send({ error: result.error })
    }
    return reply.code(200).send({
      paymentStatus: 'succeeded' as const,
      reservationStatus: 'scheduled' as const,
      balanceCents: result.balanceCents,
    })
  })


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
      | { code: 200; body: { ok: true } }
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
      if (existing.status === 'pending') {
        await tx.update(lockers)
          .set({ state: 'idle', lastStateAt: new Date(), updatedAt: new Date() })
          .where(eq(lockers.id, existing.lockerId))
      }

      return { code: 200, body: { ok: true as const } }
    })

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
