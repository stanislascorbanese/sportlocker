/**
 * Plugin Fastify `/v1/reservations` — orchestrateur des sous-modules.
 *
 * Le monolithe d'origine (1327 lignes, audit dette tech §2) a été split en
 * 4 sous-plugins par concern, avec les DTOs et helpers extraits dans des
 * modules partagés. Ce fichier garde seulement le point d'entrée plugin et
 * l'ordre d'enregistrement des sous-modules.
 *
 *   - views      : GET /active, GET /me (lecture pure)
 *   - pay        : POST /:id/pay, /pay/confirm-simulated, /pay/wallet
 *   - lifecycle  : POST /:id/cancel, /:id/return, PATCH /:id/extend
 *   - review     : POST /:id/review (avis citoyen après retour)
 *   - create     : POST /, POST /slots (création résa immédiate + slot)
 *
 * Toutes les routes sont préfixées `/v1/reservations` via `app.register(...)`
 * dans `services/api/src/app.ts` — ce fichier ne définit pas le prefix.
 */
import type { FastifyInstance } from 'fastify'

import { reservationCreateRoutes } from './reservations/create.js'
import { reservationLifecycleRoutes } from './reservations/lifecycle.js'
import { reservationPayRoutes } from './reservations/pay.js'
import { reservationReviewRoutes } from './reservations/review.js'
import { reservationViewsRoutes } from './reservations/views.js'

export async function reservationRoutes(app: FastifyInstance) {
  await app.register(reservationViewsRoutes)     // GET /active, GET /me
  await app.register(reservationPayRoutes)       // POST /:id/pay, /pay/confirm-simulated, /pay/wallet
  await app.register(reservationLifecycleRoutes) // POST /:id/cancel, /:id/return, PATCH /:id/extend
  await app.register(reservationReviewRoutes)    // POST /:id/review
  await app.register(reservationCreateRoutes)    // POST /, POST /slots
}
