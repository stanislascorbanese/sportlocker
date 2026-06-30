import { and, eq } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { payments, reservations } from '../db/schema.js'

/**
 * Transitions partagées du paiement d'une location de casier.
 *
 * Source unique de vérité appelée par les 3 chemins de confirmation :
 *   - webhook Stripe `payment_intent.succeeded`
 *   - confirmation simulée (`POST /:id/pay/confirm-simulated`, mode simulate)
 *   - (échec) webhook `payment_intent.payment_failed`
 *
 * Toutes les transitions sont idempotentes : un re-run (webhook redélivré,
 * double-clic) ne casse rien.
 */

export type MarkPaidResult =
  | { kind: 'ok' }
  | { kind: 'already_paid' }
  | { kind: 'not_found' }
  | { kind: 'reservation_not_pending' }

/**
 * Marque un paiement comme réussi et bascule la résa `pending_payment` →
 * `scheduled` (QR désormais délivrable par GET /active). Atomique.
 */
export async function markPaymentSucceeded(
  paymentId: string,
  log?: FastifyBaseLogger,
): Promise<MarkPaidResult> {
  return db.transaction(async (tx) => {
    const [pay] = await tx
      .select({
        id: payments.id,
        status: payments.status,
        reservationId: payments.reservationId,
      })
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1)

    if (!pay) return { kind: 'not_found' as const }
    if (pay.status === 'succeeded') return { kind: 'already_paid' as const }

    const now = new Date()
    await tx
      .update(payments)
      .set({ status: 'succeeded', paidAt: now, errorMessage: null, updatedAt: now })
      .where(eq(payments.id, pay.id))

    // Bascule uniquement si encore en attente — sinon (annulée/expirée par le
    // cron entre-temps) on ne ressuscite pas une résa morte. Le paiement reste
    // marqué succeeded : la réconciliation/remboursement se fait à part.
    const flipped = await tx
      .update(reservations)
      .set({ status: 'scheduled', updatedAt: now })
      .where(and(
        eq(reservations.id, pay.reservationId),
        eq(reservations.status, 'pending_payment'),
      ))
      .returning({ id: reservations.id })

    if (flipped.length === 0) {
      log?.warn({ paymentId, reservationId: pay.reservationId },
        'payment succeeded but reservation no longer pending_payment')
      return { kind: 'reservation_not_pending' as const }
    }

    log?.info({ paymentId, reservationId: pay.reservationId }, 'payment succeeded → scheduled')
    return { kind: 'ok' as const }
  })
}

/**
 * Marque un paiement comme échoué. La résa reste `pending_payment` : le
 * citoyen peut relancer un paiement (nouvel intent) tant que le cron n'a pas
 * expiré la résa.
 */
export async function markPaymentFailed(
  paymentId: string,
  errorMessage: string | null,
  log?: FastifyBaseLogger,
): Promise<void> {
  const now = new Date()
  await db
    .update(payments)
    .set({ status: 'failed', errorMessage, updatedAt: now })
    .where(and(eq(payments.id, paymentId), eq(payments.status, 'pending')))
  log?.info({ paymentId }, 'payment failed')
}
