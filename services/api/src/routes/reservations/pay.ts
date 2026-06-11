/**
 * Routes de paiement d'une réservation : `POST /:id/pay`,
 * `POST /:id/pay/confirm-simulated`, `POST /:id/pay/wallet`.
 *
 * Extraites de `routes/reservations.ts` (audit dette tech §2). Trois flows
 * de paiement distincts pour passer une résa de `pending_payment` à
 * `scheduled` :
 *   - Stripe (carte / Apple Pay / Google Pay / PayPal / Klarna)
 *   - simulate (dev/staging sans Stripe)
 *   - wallet prépayé (solde existant du citoyen)
 *
 * Le webhook Stripe (`/v1/stripe/webhook`) prend le relais pour bascule la
 * résa une fois le `payment_intent.succeeded` reçu — cf. routes/stripe-webhook.
 *
 * Registered comme sous-plugin Fastify par `reservations.ts` via
 * `app.register(reservationPayRoutes)`.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db/client.js'
import { payments, reservations } from '../../db/schema.js'
import { markPaymentSucceeded } from '../../lib/payments.js'
import { requireStripe } from '../../lib/stripe.js'
import { getWalletBalanceCents } from '../../lib/wallet.js'

import {
  ErrorDTO, PaymentIntentDTO, SimulatedConfirmDTO, WalletPayDTO,
} from './dtos.js'

export async function reservationPayRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

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
}
