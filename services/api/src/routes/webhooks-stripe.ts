import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { communes } from '../db/schema.js'
import { StripeNotConfiguredError, requireStripe } from '../lib/stripe.js'

/**
 * Webhook Stripe pour la sync auto des comptes Connect Express.
 *
 * Complète G1/G2 : avant cette PR, les flags `charges_enabled` /
 * `payouts_enabled` côté DB n'étaient mis à jour qu'au clic explicite sur
 * "Rafraîchir le statut" depuis le dashboard. Avec le webhook, Stripe nous
 * notifie dès qu'un compte change d'état (KYC validé, AML pause, RIB
 * vérifié, etc.) et on met à jour la DB en temps réel.
 *
 * ## Sécurité
 *
 * Stripe signe chaque payload avec `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256).
 * Sans vérif, n'importe qui pourrait POST sur `/v1/webhooks/stripe` et
 * marquer une commune "verified" sans onboarding réel — fraude critique.
 *
 * On utilise `stripe.webhooks.constructEvent()` qui :
 *   1. Vérifie la signature avec notre secret
 *   2. Rejette les payloads > 5 min (anti-replay)
 *   3. Parse le JSON en `Stripe.Event` typé
 *
 * ## Body parsing
 *
 * La vérif signature exige le payload **raw bytes** — pas du JSON parsé
 * (sinon les espaces / l'ordre des clés changent et l'HMAC fail). On
 * déclare donc un content-type parser local au scope du plugin :
 *
 *   addContentTypeParser('application/json', { parseAs: 'buffer' }, …)
 *
 * Cette override n'affecte QUE ce sous-scope Fastify, le reste de l'app
 * continue à parser le JSON normalement.
 *
 * ## Events gérés
 *
 *   - `account.updated` → update `stripe_connect_charges_enabled`,
 *     `stripe_connect_payouts_enabled` et pose `stripe_connect_onboarded_at`
 *     à la première transition `charges && payouts === true`.
 *
 *   - autres types → log + 200 OK (Stripe re-essaie 3× sur non-2xx, on
 *     évite de remplir la file avec des events qu'on ne veut pas gérer).
 *
 * ## Idempotence
 *
 * Les `event.id` sont uniques mais Stripe peut renvoyer le même event si
 * notre 200 n'arrive pas (retries). Pour `account.updated`, l'opération est
 * naturellement idempotente : on UPDATE avec les valeurs courantes, donc
 * rejouer n'a pas d'effet de bord. Pas besoin de `event.id` log pour
 * dedup.
 */

export async function webhooksStripeRoutes(app: FastifyInstance) {
  // Parser local : reçoit le body comme Buffer pour la vérif HMAC.
  // `parseAs: 'buffer'` court-circuite le JSON parsing par défaut.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => {
      // body est déjà un Buffer grâce à parseAs — on le passe tel quel.
      done(null, body)
    },
  )

  app.post('/stripe', {
    // Schemas désactivés pour cette route : le body est binaire (Buffer),
    // pas un JSON object → Fastify ne saurait pas le valider via Zod.
    config: { rawBody: true },
  }, async (req, reply) => {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      // Secret pas configuré → on n'a aucun moyen de vérifier la signature
      // → on refuse plutôt que d'accepter aveuglément.
      reply.code(503).send({ error: 'stripe_webhook_not_configured' })
      return
    }

    let stripe: ReturnType<typeof requireStripe>
    try {
      stripe = requireStripe()
    } catch (err) {
      if (err instanceof StripeNotConfiguredError) {
        reply.code(503).send({ error: 'stripe_not_configured' })
        return
      }
      throw err
    }

    const signature = req.headers['stripe-signature']
    if (!signature || Array.isArray(signature)) {
      reply.code(400).send({ error: 'missing_stripe_signature' })
      return
    }

    let event: Stripe.Event
    try {
      // `req.body` est un Buffer grâce à notre content-type parser ci-dessus.
      // constructEvent attend `string | Buffer` pour la sig vérif.
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      )
    } catch (err) {
      req.log.warn({ err }, 'stripe webhook signature verification failed')
      reply.code(400).send({ error: 'invalid_signature' })
      return
    }

    req.log.info({ eventType: event.type, eventId: event.id }, 'stripe webhook received')

    switch (event.type) {
      case 'account.updated': {
        await handleAccountUpdated(event.data.object as Stripe.Account, req.log)
        break
      }
      default:
        // Pas besoin de gérer → 200 OK pour éviter les retries Stripe.
        req.log.debug({ eventType: event.type }, 'stripe webhook event type ignored')
    }

    return reply.code(200).send({ received: true })
  })
}

async function handleAccountUpdated(
  account: Stripe.Account,
  log: import('fastify').FastifyBaseLogger,
): Promise<void> {
  const accountId = account.id
  const chargesEnabled = account.charges_enabled === true
  const payoutsEnabled = account.payouts_enabled === true

  // Cherche la commune liée à cet account_id. Pas de match = un account
  // créé hors-flow (manuel via Stripe Dashboard) ou orphelin (commune
  // supprimée). On log + skip — pas une erreur.
  const rows = await db
    .select({
      id: communes.id,
      currentOnboardedAt: communes.stripeConnectOnboardedAt,
    })
    .from(communes)
    .where(eq(communes.stripeConnectAccountId, accountId))
    .limit(1)

  const commune = rows[0]
  if (!commune) {
    log.warn(
      { accountId },
      'stripe webhook account.updated for unknown commune — skipped',
    )
    return
  }

  // Pose `onboardedAt = now()` la première fois que les 2 flags passent
  // simultanément à true. Ne PAS l'effacer si l'un repasse false plus tard
  // (Stripe peut pauser un compte pour AML — pas un dé-onboarding).
  const onboardedAt =
    commune.currentOnboardedAt
    ?? (chargesEnabled && payoutsEnabled ? new Date() : null)

  await db
    .update(communes)
    .set({
      stripeConnectChargesEnabled: chargesEnabled,
      stripeConnectPayoutsEnabled: payoutsEnabled,
      stripeConnectOnboardedAt: onboardedAt,
      updatedAt: new Date(),
    })
    .where(eq(communes.id, commune.id))

  log.info(
    { accountId, communeId: commune.id, chargesEnabled, payoutsEnabled },
    'stripe webhook account.updated → commune flags synced',
  )
}
