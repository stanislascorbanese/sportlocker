import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { payments, walletTopups } from '../db/schema.js'
import { requireStripe } from '../lib/stripe.js'
import { confirmTopup, getWalletBalanceCents } from '../lib/wallet.js'

/**
 * Routes `/v1/wallet/*` — porte-monnaie prépayé citoyen (carnet/pass, Phase 1).
 *
 * Recharge (one-off Stripe ou simulate) → crédite le solde. Le solde se dépense
 * ensuite sur les locations via `POST /v1/reservations/:id/pay/wallet` (0 frais).
 *
 * Solde = Σ(recharges succeeded) − Σ(dépenses wallet succeeded). Cf. lib/wallet.
 */

// Bornes de recharge : assez haut pour amortir le frais fixe Stripe (0,25 €),
// plafonné pour limiter le risque de solde prépayé dormant.
const TOPUP_MIN_CENTS = 500      // 5 €
const TOPUP_MAX_CENTS = 50_000   // 500 €

const ErrorDTO = z.object({ error: z.string() })

const TopupLite = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int(),
  status: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
  provider: z.string(),
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
})

const SpendLite = z.object({
  amountCents: z.number().int(),
  reservationId: z.string().uuid(),
  paidAt: z.string().datetime().nullable(),
})

const WalletDTO = z.object({
  balanceCents: z.number().int(),
  currency: z.string(),
  topups: z.array(TopupLite),
  spends: z.array(SpendLite),
})

const TopupResponseDTO = z.object({
  topupId: z.string().uuid(),
  provider: z.enum(['stripe', 'simulate']),
  status: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
  clientSecret: z.string().nullable()
    .describe('Secret du PaymentIntent à passer à Stripe.js. null en mode simulate '
      + '(le client enchaîne sur POST /topup/:id/confirm-simulated).'),
})

const SimulatedConfirmDTO = z.object({
  topupStatus: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'refunded']),
  balanceCents: z.number().int(),
})

export async function walletRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  // ─── GET /v1/wallet — solde + historique ────────────────────────────────
  app.get('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Porte-monnaie'],
      summary: 'Solde du porte-monnaie + dernières recharges/dépenses',
      security: [{ bearerAuth: [] }],
      response: { 200: WalletDTO, 401: ErrorDTO },
    },
  }, async (req) => {
    const userId = req.user.sub

    const [balanceCents, topupRows, spendRows] = await Promise.all([
      getWalletBalanceCents(userId),
      db
        .select({
          id: walletTopups.id,
          amountCents: walletTopups.amountCents,
          status: walletTopups.status,
          provider: walletTopups.provider,
          createdAt: walletTopups.createdAt,
          paidAt: walletTopups.paidAt,
        })
        .from(walletTopups)
        .where(eq(walletTopups.userId, userId))
        .orderBy(desc(walletTopups.createdAt))
        .limit(20),
      db
        .select({
          amountCents: payments.amountCents,
          reservationId: payments.reservationId,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .where(and(
          eq(payments.userId, userId),
          eq(payments.provider, 'wallet'),
          eq(payments.status, 'succeeded'),
        ))
        .orderBy(desc(payments.paidAt))
        .limit(20),
    ])

    return {
      balanceCents,
      currency: 'EUR',
      topups: topupRows.map((t) => ({
        id: t.id,
        amountCents: t.amountCents,
        status: t.status,
        provider: t.provider,
        createdAt: t.createdAt.toISOString(),
        paidAt: t.paidAt?.toISOString() ?? null,
      })),
      spends: spendRows.map((s) => ({
        amountCents: s.amountCents,
        reservationId: s.reservationId,
        paidAt: s.paidAt?.toISOString() ?? null,
      })),
    }
  })

  // ─── POST /v1/wallet/topup — initie une recharge ─────────────────────────
  app.post('/topup', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Porte-monnaie'],
      summary: 'Recharge le porte-monnaie (PaymentIntent Stripe ou simulate)',
      security: [{ bearerAuth: [] }],
      body: z.object({
        amountCents: z.number().int().min(TOPUP_MIN_CENTS).max(TOPUP_MAX_CENTS),
      }),
      response: { 200: TopupResponseDTO, 400: ErrorDTO, 401: ErrorDTO, 503: ErrorDTO },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { amountCents } = req.body

    const [topup] = await db
      .insert(walletTopups)
      .values({
        userId,
        amountCents,
        currency: 'EUR',
        provider: env.PAYMENTS_PROVIDER,
        status: 'pending',
      })
      .returning({ id: walletTopups.id, status: walletTopups.status })

    if (env.PAYMENTS_PROVIDER === 'simulate') {
      return reply.code(200).send({
        topupId: topup!.id,
        provider: 'simulate' as const,
        status: topup!.status,
        clientSecret: null,
      })
    }

    const stripe = requireStripe()
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      metadata: { kind: 'wallet_topup', topupId: topup!.id, userId },
      automatic_payment_methods: { enabled: true },
    }, { idempotencyKey: `topup_${topup!.id}` })

    await db
      .update(walletTopups)
      .set({ stripePaymentIntentId: pi.id, updatedAt: new Date() })
      .where(eq(walletTopups.id, topup!.id))

    return reply.code(200).send({
      topupId: topup!.id,
      provider: 'stripe' as const,
      status: topup!.status,
      clientSecret: pi.client_secret,
    })
  })

  // ─── POST /v1/wallet/topup/:id/confirm-simulated ─────────────────────────
  app.post('/topup/:id/confirm-simulated', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Porte-monnaie'],
      summary: 'Confirme une recharge simulée (dev/staging sans Stripe)',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      response: { 200: SimulatedConfirmDTO, 403: ErrorDTO, 404: ErrorDTO, 409: ErrorDTO },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params

    const [topup] = await db
      .select({
        id: walletTopups.id,
        userId: walletTopups.userId,
        provider: walletTopups.provider,
        status: walletTopups.status,
      })
      .from(walletTopups)
      .where(eq(walletTopups.id, id))
      .limit(1)

    if (!topup) return reply.code(404).send({ error: 'topup_not_found' })
    if (topup.userId !== userId) return reply.code(403).send({ error: 'forbidden' })
    if (topup.provider !== 'simulate') return reply.code(409).send({ error: 'not_simulated' })

    const res = await confirmTopup(topup.id, app.log)
    if (res.kind === 'not_found') return reply.code(404).send({ error: 'topup_not_found' })

    const balanceCents = await getWalletBalanceCents(userId)
    const [row] = await db
      .select({ status: walletTopups.status })
      .from(walletTopups)
      .where(eq(walletTopups.id, topup.id))
      .limit(1)

    return reply.code(200).send({ topupStatus: row!.status, balanceCents })
  })
}
