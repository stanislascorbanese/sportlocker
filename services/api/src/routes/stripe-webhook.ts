/**
 * Webhook Stripe — confirme les paiements de location de façon asynchrone.
 *
 * Stripe POST ici à chaque évènement de paiement. On vérifie la signature
 * (`stripe-signature` + STRIPE_WEBHOOK_SECRET) AVANT toute action : un body non
 * signé est rejeté (403). La vérification exige le corps brut (Buffer), d'où le
 * content-type parser local à ce plugin (encapsulé — n'affecte pas les autres
 * routes qui parsent du JSON normalement).
 *
 * Évènements traités :
 *   - payment_intent.succeeded       → markPaymentSucceeded (résa → scheduled)
 *   - payment_intent.payment_failed  → markPaymentFailed (résa reste payable)
 *
 * Le `paymentId` est récupéré depuis `metadata` du PaymentIntent (posé à la
 * création dans POST /:id/pay). Idempotent : Stripe peut redélivrer un event.
 */
import type { FastifyInstance } from 'fastify'
import type Stripe from 'stripe'

import { env } from '../config/env.js'
import { markPaymentFailed, markPaymentSucceeded } from '../lib/payments.js'
import { getStripe } from '../lib/stripe.js'

export async function stripeWebhookRoutes(app: FastifyInstance) {
  // Corps brut nécessaire à la vérification de signature Stripe.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => { done(null, body) },
  )

  app.post('/webhook', {
    schema: {
      tags: ['Stripe'],
      summary: 'Webhook Stripe (paiement réussi / échoué)',
      description: 'Endpoint appelé par Stripe. Vérifie la signature, puis confirme ou échoue le paiement.',
    },
    config: { rawBody: true },
  }, async (req, reply) => {
    if (env.PAYMENTS_PROVIDER !== 'stripe' || !env.STRIPE_WEBHOOK_SECRET) {
      return reply.code(503).send({ error: 'stripe_disabled' })
    }

    const sig = req.headers['stripe-signature']
    if (typeof sig !== 'string') {
      return reply.code(400).send({ error: 'missing_signature' })
    }

    const stripe = getStripe()
    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig,
        env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (err) {
      app.log.warn({ err }, 'stripe webhook signature verification failed')
      return reply.code(403).send({ error: 'invalid_signature' })
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent
      const paymentId = pi.metadata?.paymentId
      if (paymentId) await markPaymentSucceeded(paymentId, app.log)
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent
      const paymentId = pi.metadata?.paymentId
      if (paymentId) {
        await markPaymentFailed(paymentId, pi.last_payment_error?.message ?? null, app.log)
      }
    }

    return reply.code(200).send({ received: true })
  })
}
