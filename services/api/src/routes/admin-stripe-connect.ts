import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { communes } from '../db/schema.js'
import { requireAdminScope } from '../lib/commune-scope.js'
import { StripeNotConfiguredError, requireStripe } from '../lib/stripe.js'

/**
 * Routes `/v1/admin/stripe-connect/*` — onboarding Stripe Connect Express
 * pour les tenants (communes / campings / hôtels).
 *
 * Flow attendu côté dashboard ops :
 *   1. Admin clique "Connecter mon compte Stripe" → POST /onboard
 *   2. Backend crée l'Account Express si manquant (champ
 *      communes.stripe_connect_account_id), puis génère un AccountLink
 *      Stripe-hosted (KYC + RIB). Réponse : { url, accountId }.
 *   3. Dashboard redirige vers `url`.
 *   4. Admin complète le KYC chez Stripe, revient sur `return_url` côté
 *      dashboard.
 *   5. Dashboard appelle POST /refresh pour pull le status courant (Stripe
 *      ne webhook qu'avec un délai variable — refresh manuel = UX immédiate).
 *   6. GET /status renvoie l'état affichable (badge "Connecté" / "À
 *      configurer" / "En cours de vérification").
 *
 * Sécurité multi-tenant :
 *   - Toutes les routes sont scopées via `requireAdminScope` → un admin
 *     d'une commune A ne peut pas onboarder ni regarder la commune B.
 *   - Super admin : bypass scoping mais doit passer `?communeId=` en query
 *     pour cibler explicitement (sinon 400 — pas de fallback silencieux).
 *
 * Mode non-configuré :
 *   - Si STRIPE_SECRET_KEY absent, toutes les routes renvoient 503
 *     `{ error: 'stripe_not_configured' }`. Le dashboard doit dégrader
 *     proprement (badge "Stripe non configuré côté serveur").
 */

const StatusDTO = z.object({
  connected: z.boolean(),
  accountId: z.string().nullable(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  onboardedAt: z.string().datetime().nullable(),
})

const OnboardResponseDTO = z.object({
  url: z.string().url(),
  accountId: z.string(),
  expiresAt: z.number().int().describe('Unix epoch seconds — AccountLink expire à cette date'),
})

const ErrorDTO = z.object({ error: z.string() })

// Helper : resolve le commune ID effectif à partir du scope. Super admin doit
// passer ?communeId en query (ou en body pour les POST).
function resolveCommuneId(
  scope: { communeId: string } | null,
  input: { communeId?: string | undefined },
  reply: import('fastify').FastifyReply,
): string | null {
  if (scope) return scope.communeId
  // super_admin → param requis
  const explicit = input.communeId
  if (!explicit) {
    reply.code(400).send({ error: 'super_admin_must_specify_commune_id' })
    return null
  }
  return explicit
}

export async function adminStripeConnectRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.addHook('onRequest', async (req, reply) => {
    await req.jwtVerify()
    const auth = requireAdminScope(req, reply)
    if (!auth.ok) return reply
  })

  // ─── GET /v1/admin/stripe-connect/status ─────────────────────────────────
  r.get(
    '/status',
    {
      schema: {
        tags: ['admin-stripe-connect'],
        summary: 'État Stripe Connect de la commune (admin scopée)',
        querystring: z.object({
          communeId: z.string().uuid().optional(),
        }),
        response: {
          200: StatusDTO,
          400: ErrorDTO,
          404: ErrorDTO,
          503: ErrorDTO,
        },
      },
    },
    async (req, reply) => {
      const auth = requireAdminScope(req, reply)
      if (!auth.ok) return
      const communeId = resolveCommuneId(auth.scope, req.query, reply)
      if (!communeId) return

      const rows = await db
        .select({
          stripeConnectAccountId: communes.stripeConnectAccountId,
          stripeConnectChargesEnabled: communes.stripeConnectChargesEnabled,
          stripeConnectPayoutsEnabled: communes.stripeConnectPayoutsEnabled,
          stripeConnectOnboardedAt: communes.stripeConnectOnboardedAt,
        })
        .from(communes)
        .where(eq(communes.id, communeId))
        .limit(1)

      const row = rows[0]
      if (!row) {
        reply.code(404).send({ error: 'commune_not_found' })
        return
      }

      return reply.send({
        connected: row.stripeConnectAccountId !== null,
        accountId: row.stripeConnectAccountId,
        chargesEnabled: row.stripeConnectChargesEnabled,
        payoutsEnabled: row.stripeConnectPayoutsEnabled,
        onboardedAt: row.stripeConnectOnboardedAt
          ? row.stripeConnectOnboardedAt.toISOString()
          : null,
      })
    },
  )

  // ─── POST /v1/admin/stripe-connect/onboard ───────────────────────────────
  // Crée l'Account Express si manquant, retourne un AccountLink hosted.
  r.post(
    '/onboard',
    {
      schema: {
        tags: ['admin-stripe-connect'],
        summary: 'Démarrer / reprendre l\'onboarding Stripe Connect (Account Link)',
        body: z.object({
          communeId: z.string().uuid().optional(),
        }),
        response: {
          200: OnboardResponseDTO,
          400: ErrorDTO,
          404: ErrorDTO,
          503: ErrorDTO,
        },
      },
    },
    async (req, reply) => {
      const auth = requireAdminScope(req, reply)
      if (!auth.ok) return

      const communeId = resolveCommuneId(auth.scope, req.body, reply)
      if (!communeId) return

      const rows = await db
        .select({
          id: communes.id,
          contactEmail: communes.contactEmail,
          stripeConnectAccountId: communes.stripeConnectAccountId,
        })
        .from(communes)
        .where(eq(communes.id, communeId))
        .limit(1)

      const commune = rows[0]
      if (!commune) {
        reply.code(404).send({ error: 'commune_not_found' })
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

      // Crée l'Account Express si manquant. On set country=FR (cible
      // exclusivement le marché français pour le MVP) et capabilities=
      // transfers (75% reçus en transfer depuis platform) + card_payments
      // (paye en direct via Connect → futur G3).
      let accountId = commune.stripeConnectAccountId
      if (!accountId) {
        // `email` est obligé d'être omis (et pas `undefined`) sous
        // exactOptionalPropertyTypes — Stripe SDK typing strict.
        const accountParams: import('stripe').default.AccountCreateParams = {
          type: 'express',
          country: 'FR',
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_type: 'government_entity',
          metadata: {
            sportlocker_commune_id: commune.id,
          },
        }
        if (commune.contactEmail) {
          accountParams.email = commune.contactEmail
        }
        const account = await stripe.accounts.create(accountParams)
        accountId = account.id
        // Persiste l'ID immédiatement — le user a déjà payé le KYC, on ne
        // veut pas qu'un retry crée un 2ème Account orphelin.
        await db
          .update(communes)
          .set({
            stripeConnectAccountId: accountId,
            updatedAt: new Date(),
          })
          .where(eq(communes.id, commune.id))
      }

      // Refresh URL : Stripe redirige ici si l'AccountLink expire pendant
      // que l'user fait son KYC (par défaut 5 min). Le dashboard relance
      // /onboard et obtient un nouveau lien.
      // Return URL : où Stripe redirige une fois le flow terminé (succès OU
      // abandon — il faut check `charges_enabled` côté backend).
      const baseUrl = env.DASHBOARD_INVITE_BASE_URL
      const link = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/settings/payments/refresh`,
        return_url: `${baseUrl}/settings/payments/return`,
        type: 'account_onboarding',
      })

      return reply.send({
        url: link.url,
        accountId,
        expiresAt: link.expires_at,
      })
    },
  )

  // ─── POST /v1/admin/stripe-connect/refresh ───────────────────────────────
  // Pull les flags charges_enabled / payouts_enabled depuis Stripe et update
  // la DB. À appeler côté dashboard quand l'admin revient de Stripe (return_url),
  // ou via un bouton "Rafraîchir le statut" tant que le webhook n'est pas wiré.
  r.post(
    '/refresh',
    {
      schema: {
        tags: ['admin-stripe-connect'],
        summary: 'Re-pull le status Stripe Connect depuis l\'API Stripe',
        body: z.object({
          communeId: z.string().uuid().optional(),
        }),
        response: {
          200: StatusDTO,
          400: ErrorDTO,
          404: ErrorDTO,
          409: ErrorDTO,
          503: ErrorDTO,
        },
      },
    },
    async (req, reply) => {
      const auth = requireAdminScope(req, reply)
      if (!auth.ok) return

      const communeId = resolveCommuneId(auth.scope, req.body, reply)
      if (!communeId) return

      const rows = await db
        .select({
          id: communes.id,
          stripeConnectAccountId: communes.stripeConnectAccountId,
          stripeConnectOnboardedAt: communes.stripeConnectOnboardedAt,
        })
        .from(communes)
        .where(eq(communes.id, communeId))
        .limit(1)

      const commune = rows[0]
      if (!commune) {
        reply.code(404).send({ error: 'commune_not_found' })
        return
      }
      if (!commune.stripeConnectAccountId) {
        reply.code(409).send({ error: 'not_onboarded' })
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

      const account = await stripe.accounts.retrieve(commune.stripeConnectAccountId)

      const chargesEnabled = account.charges_enabled === true
      const payoutsEnabled = account.payouts_enabled === true
      // Pose le timestamp "premier onboarding complet" la première fois où
      // les 2 flags sont true simultanément. Ne pas l'effacer si l'un repasse
      // false plus tard (Stripe peut pauser un compte pour AML — pas un
      // dé-onboarding).
      const onboardedAt = commune.stripeConnectOnboardedAt
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

      return reply.send({
        connected: true,
        accountId: commune.stripeConnectAccountId,
        chargesEnabled,
        payoutsEnabled,
        onboardedAt: onboardedAt ? onboardedAt.toISOString() : null,
      })
    },
  )
}
