import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { pushTokens } from '../db/schema.js'
import { isPgViolation, PG_ERRORS } from '../lib/pg-errors.js'

/**
 * Routes citoyen pour gérer les Web Push subscriptions.
 *
 * Flow :
 *   1. Côté browser, `navigator.serviceWorker.register()` puis
 *      `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC_KEY })`
 *      retourne un `PushSubscription` JSON-serializable.
 *   2. Le client POST l'objet ici → on stocke endpoint + keys en DB.
 *   3. Quand un cron veut envoyer une notif (ex. rappel slot J-H1), il
 *      lit les rows et appelle `sendWebPush()` (cf. lib/webpush.ts).
 *   4. Si une notif renvoie 404/410 (subscription révoquée), le caller
 *      DELETE la row pour ne plus retenter.
 *
 * Anti-duplicate : l'endpoint est UNIQUE en DB. Si le même browser
 * re-subscribe (renouvellement Firebase Cloud Messaging par exemple),
 * on UPDATE les keys + lastUsedAt au lieu de créer une nouvelle row.
 */

const ErrorDTO = z.object({ error: z.string() })

const SubscribeBody = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(10).max(50),
  }),
  /** Optionnel : userAgent ou label pour distinguer ce device dans /profile. */
  deviceInfo: z.record(z.string(), z.unknown()).optional(),
})

const PushSubscriptionDTO = z.object({
  id: z.string().uuid(),
  endpoint: z.string().url(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
})

const ConfigDTO = z.object({
  /**
   * VAPID public key à fournir au browser lors de `pushManager.subscribe()`.
   * Si null, le client doit cacher le bouton "Activer les notifications"
   * et afficher un message "non disponible pour le moment".
   */
  vapidPublicKey: z.string().nullable(),
})

export async function pushSubscriptionRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/push-subscriptions/config — clé publique VAPID + capabilities.
   *
   * Le client utilise `vapidPublicKey` lors de l'appel `pushManager.subscribe()`.
   * Renvoie `null` si l'API n'a pas de clé VAPID configurée (l'envoi de
   * notifs sera désactivé, le client doit le détecter et adapter l'UI).
   */
  app.get('/config', {
    schema: {
      tags: ['Citoyens — Push'],
      summary: 'VAPID public key (pour pushManager.subscribe côté browser)',
      description: 'Route publique. Renvoie la clé publique VAPID utilisée par le browser '
        + 'pour s\'abonner au push service. `null` si l\'API n\'a pas de clés VAPID en env.',
      response: { 200: ConfigDTO },
    },
  }, async () => {
    return { vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null }
  })

  /**
   * POST /v1/push-subscriptions — enregistre / met à jour la subscription
   * du browser courant pour le user authentifié.
   *
   * Idempotent : si l'endpoint existe déjà (re-subscribe du même browser),
   * on UPDATE les keys + lastUsedAt + userId (au cas où le user a changé,
   * ex. logout/login d'un autre compte sur le même device).
   */
  app.post('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Push'],
      summary: 'Enregistre une subscription Web Push',
      description: 'Stocke l\'endpoint + keys p256dh/auth retournés par le browser. '
        + 'Idempotent : un re-subscribe du même endpoint UPDATE les keys au lieu de dupliquer.',
      security: [{ bearerAuth: [] }],
      body: SubscribeBody,
      response: {
        201: PushSubscriptionDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { endpoint, keys, deviceInfo } = req.body
    const now = new Date()

    try {
      const [row] = await db
        .insert(pushTokens)
        .values({
          userId,
          endpoint,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
          deviceInfo: deviceInfo ?? {},
          lastUsedAt: now,
        })
        .onConflictDoUpdate({
          target: pushTokens.endpoint,
          set: {
            userId,
            p256dhKey: keys.p256dh,
            authKey: keys.auth,
            deviceInfo: deviceInfo ?? {},
            lastUsedAt: now,
          },
        })
        .returning()

      return reply.code(201).send({
        id: row!.id,
        endpoint: row!.endpoint!,
        createdAt: row!.createdAt.toISOString(),
        lastUsedAt: row!.lastUsedAt.toISOString(),
      })
    } catch (err) {
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION)) {
        return reply.code(409).send({ error: 'endpoint_conflict' })
      }
      throw err
    }
  })

  /**
   * DELETE /v1/push-subscriptions — désinscrit la subscription du user
   * courant identifiée par son endpoint.
   *
   * Idempotent : 200 même si la row n'existait pas (le browser peut
   * essayer de désinscrire après que le user a fait clear-data côté
   * navigateur).
   */
  app.delete('/', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Push'],
      summary: 'Désinscrit une subscription Web Push',
      description: 'Identifie la subscription via son endpoint dans le body. Idempotent.',
      security: [{ bearerAuth: [] }],
      body: z.object({ endpoint: z.string().url().max(500) }),
      response: { 200: z.object({ ok: z.literal(true) }) },
    },
  }, async (req) => {
    await db
      .delete(pushTokens)
      .where(and(
        eq(pushTokens.userId, req.user.sub),
        eq(pushTokens.endpoint, req.body.endpoint),
      ))
    return { ok: true as const }
  })
}
