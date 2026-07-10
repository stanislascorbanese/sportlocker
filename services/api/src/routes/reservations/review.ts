/**
 * Route d'avis citoyen : `POST /v1/reservations/:id/review`.
 *
 * Boucle de feedback : une fois l'emprunt rendu (`status='returned'`), le
 * citoyen peut noter son expérience (1..5 étoiles) et laisser un commentaire
 * optionnel. Un seul avis par réservation (contrainte UNIQUE sur
 * `reviews.reservation_id`).
 *
 * Registered comme sous-plugin Fastify par `reservations.ts` via
 * `app.register(reservationReviewRoutes)`.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { eq } from 'drizzle-orm'

import { db } from '../../db/client.js'
import { reservations, reviews } from '../../db/schema.js'
import { PG_ERRORS, isPgViolation } from '../../lib/pg-errors.js'

import { z } from 'zod'
import { CreateReviewBody, ErrorDTO, ReviewCreatedDTO } from './dtos.js'
import type { DbTx } from './helpers.js'

export async function reservationReviewRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * POST /v1/reservations/:id/review — dépose un avis sur une résa terminée.
   *
   * Règles métier :
   *   - la réservation appartient au user courant (sinon 404, anti-énumération
   *     — on ne révèle pas l'existence d'une résa d'autrui)
   *   - status = 'returned' (sinon 409 `reservation_not_reviewable`) : on ne
   *     note que ce qu'on a effectivement vécu jusqu'au bout
   *   - un seul avis par réservation (sinon 409 `review_already_exists`)
   */
  app.post('/:id/review', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Réservations'],
      summary: 'Dépose un avis (note + commentaire) sur une réservation rendue',
      description: 'Autorisé uniquement par le propriétaire de la réservation, '
        + 'uniquement si le statut est terminal `returned`. Un seul avis par '
        + 'réservation : 409 `review_already_exists` au 2e envoi.',
      security: [{ bearerAuth: [] }],
      params: z.object({ id: z.string().uuid() }),
      body: CreateReviewBody,
      response: {
        201: ReviewCreatedDTO,
        404: ErrorDTO,
        409: ErrorDTO,
      },
    },
  }, async (req, reply) => {
    const userId = req.user.sub
    const { id } = req.params
    // Trim déjà fait par Zod ; on normalise "chaîne vide" → null pour ne pas
    // stocker un commentaire vide indistinct d'une absence de commentaire.
    const comment = req.body.comment && req.body.comment.length > 0 ? req.body.comment : null
    const { rating } = req.body

    type ReviewResult =
      | { kind: 'ok'; review: typeof reviews.$inferSelect }
      | { kind: 'not_found' }
      | { kind: 'not_reviewable' }
      | { kind: 'already_reviewed' }

    let result: ReviewResult
    try {
      result = await db.transaction(async (tx: DbTx): Promise<ReviewResult> => {
        const [existing] = await tx
          .select({ status: reservations.status, userId: reservations.userId })
          .from(reservations)
          .where(eq(reservations.id, id))
          .limit(1)

        // 404 (pas 403) si la résa n'existe pas OU n'appartient pas au user :
        // on ne révèle pas l'existence d'une résa d'autrui (anti-énumération).
        if (!existing || existing.userId !== userId) {
          return { kind: 'not_found' }
        }
        if (existing.status !== 'returned') {
          return { kind: 'not_reviewable' }
        }

        // Pré-check pour un 409 propre dans le cas nominal. La contrainte UNIQUE
        // reste le garde-fou anti-race (double envoi concurrent) — cf. catch.
        const [dup] = await tx
          .select({ id: reviews.id })
          .from(reviews)
          .where(eq(reviews.reservationId, id))
          .limit(1)
        if (dup) return { kind: 'already_reviewed' }

        const [inserted] = await tx
          .insert(reviews)
          .values({ reservationId: id, userId, rating, comment })
          .returning()

        return { kind: 'ok', review: inserted! }
      })
    } catch (err) {
      // Course entre deux POST concurrents : le pré-check passe pour les deux,
      // la contrainte UNIQUE(reservation_id) rejette le second → 409 propre.
      if (isPgViolation(err, PG_ERRORS.UNIQUE_VIOLATION, 'reservation')) {
        return reply.code(409).send({ error: 'review_already_exists' })
      }
      throw err
    }

    if (result.kind === 'not_found') {
      return reply.code(404).send({ error: 'reservation_not_found' })
    }
    if (result.kind === 'not_reviewable') {
      return reply.code(409).send({ error: 'reservation_not_reviewable' })
    }
    if (result.kind === 'already_reviewed') {
      return reply.code(409).send({ error: 'review_already_exists' })
    }

    return reply.code(201).send({
      id: result.review.id,
      reservationId: result.review.reservationId,
      rating: result.review.rating,
      comment: result.review.comment,
      createdAt: result.review.createdAt.toISOString(),
    })
  })
}
