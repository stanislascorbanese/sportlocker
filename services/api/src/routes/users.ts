import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'

import { UserRole } from '@sportlocker/types'

import { db } from '../db/client.js'
import { reservations, users } from '../db/schema.js'

/**
 * Routes citoyen sur le compte de l'utilisateur courant — `/v1/users/me`.
 *
 *   - GET    /me : profil du citoyen (dont `trustScore` + état RGPD).
 *   - DELETE /me : demande de suppression de compte RGPD (soft-delete).
 *
 * La suppression n'est PAS immédiate : on pose `gdpr_delete_requested_at = NOW()`
 * et le cron RGPD anonymise/supprime les données 30 jours plus tard (cf.
 * CLAUDE.md « données supprimées/anonymisées 30j après gdpr_delete_requested_at »).
 * Ce délai laisse le temps de revenir sur une demande accidentelle et de
 * clôturer d'éventuelles obligations comptables (paiements Stripe).
 */

const ErrorDTO = z.object({ error: z.string() })

const UserMeDTO = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: UserRole,
  trustScore: z.number().int()
    .describe('Score de confiance 0..100. Baisse sur retour en retard, remonte sur retours à l\'heure.'),
  communeId: z.string().uuid().nullable(),
  /**
   * Non-null si une demande de suppression RGPD est en cours (anonymisation
   * effective à J+30). La PWA affiche alors un état « suppression programmée »
   * au lieu du bouton de suppression.
   */
  gdprDeleteRequestedAt: z.string().datetime().nullable(),
})

const DeleteMeResponseDTO = z.object({
  ok: z.literal(true),
  /** Horodatage de la demande — la PWA calcule la date effective J+30. */
  gdprDeleteRequestedAt: z.string().datetime(),
})

/**
 * Statuts de réservation « vivants » qui bloquent la suppression de compte.
 * On refuse tant qu'un emprunt est en cours ou à venir (le citoyen détient
 * peut-être encore du matériel, ou un créneau/paiement est engagé). Les
 * statuts terminaux (returned/cancelled/expired) n'empêchent pas la demande.
 */
const BLOCKING_STATUSES = [
  'pending_payment', 'scheduled', 'pending', 'active', 'overdue',
] as const

export async function userRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>()

  /**
   * GET /v1/users/me — profil du citoyen authentifié.
   *
   * Expose `trustScore` (affiché en badge côté /profile) et l'état RGPD.
   * 404 `user_not_found` si le JWT référence un user supprimé (edge case :
   * session encore valide après anonymisation).
   */
  app.get('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Compte'],
      summary: 'Profil du citoyen courant (dont trustScore + état RGPD)',
      description: 'Renvoie le profil de l\'utilisateur authentifié : identité, rôle, '
        + 'score de confiance et éventuelle demande de suppression RGPD en cours.',
      security: [{ bearerAuth: [] }],
      response: { 200: UserMeDTO, 404: ErrorDTO },
    },
  }, async (req, reply) => {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        trustScore: users.trustScore,
        communeId: users.communeId,
        gdprDeleteRequestedAt: users.gdprDeleteRequestedAt,
      })
      .from(users)
      .where(eq(users.id, req.user.sub))
      .limit(1)

    if (!row) return reply.code(404).send({ error: 'user_not_found' })

    return reply.code(200).send({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      trustScore: row.trustScore,
      communeId: row.communeId,
      gdprDeleteRequestedAt: row.gdprDeleteRequestedAt?.toISOString() ?? null,
    })
  })

  /**
   * DELETE /v1/users/me — demande de suppression de compte RGPD.
   *
   * Soft-delete : pose `gdpr_delete_requested_at = NOW()`. Le cron RGPD
   * anonymise les données à J+30 (aucune suppression immédiate ici).
   *
   *   - 409 `active_reservation` si une réservation vivante existe (le citoyen
   *     doit d'abord rendre son matériel / finir son créneau).
   *   - Idempotent : si une demande existe déjà, on renvoie 200 avec l'horodatage
   *     initial (on ne réinitialise pas le compte à rebours de 30 jours).
   *   - 404 `user_not_found` si le user n'existe plus.
   */
  app.delete('/me', {
    onRequest: [app.authenticate],
    schema: {
      tags: ['Citoyens — Compte'],
      summary: 'Demande de suppression de compte (RGPD, effective à J+30)',
      description: 'Pose `gdpr_delete_requested_at = NOW()`. Les données sont anonymisées '
        + '30 jours plus tard par le cron RGPD (pas de suppression immédiate). '
        + 'Refuse `409 active_reservation` si une réservation est encore vivante '
        + '(pending_payment/scheduled/pending/active/overdue). Idempotent.',
      security: [{ bearerAuth: [] }],
      response: { 200: DeleteMeResponseDTO, 404: ErrorDTO, 409: ErrorDTO },
    },
  }, async (req, reply) => {
    const userId = req.user.sub

    // Blocage : aucune réservation vivante ne doit rester (matériel non rendu,
    // créneau à venir ou paiement en cours). On refuse plutôt que d'anonymiser
    // un compte qui a un engagement ouvert.
    const [live] = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(
        eq(reservations.userId, userId),
        inArray(reservations.status, [...BLOCKING_STATUSES]),
      ))
      .limit(1)

    if (live) return reply.code(409).send({ error: 'active_reservation' })

    const now = new Date()
    // On ne fixe l'horodatage que s'il n'est pas déjà posé (idempotence : ne pas
    // repousser le compte à rebours de 30 jours à chaque clic).
    const [updated] = await db
      .update(users)
      .set({ gdprDeleteRequestedAt: now, updatedAt: now })
      .where(and(eq(users.id, userId), isNull(users.gdprDeleteRequestedAt)))
      .returning({ gdprDeleteRequestedAt: users.gdprDeleteRequestedAt })

    if (updated?.gdprDeleteRequestedAt) {
      return reply.code(200).send({
        ok: true as const,
        gdprDeleteRequestedAt: updated.gdprDeleteRequestedAt.toISOString(),
      })
    }

    // Pas de row mise à jour : soit une demande existait déjà (idempotent),
    // soit le user n'existe pas. On relit pour distinguer les deux cas.
    const [existing] = await db
      .select({ gdprDeleteRequestedAt: users.gdprDeleteRequestedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!existing) return reply.code(404).send({ error: 'user_not_found' })

    return reply.code(200).send({
      ok: true as const,
      gdprDeleteRequestedAt: (existing.gdprDeleteRequestedAt ?? now).toISOString(),
    })
  })
}
