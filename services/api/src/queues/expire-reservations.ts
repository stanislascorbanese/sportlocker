import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { lockers, payments, reservations } from '../db/schema.js'
import { NO_SHOW_GRACE_MINUTES } from '../lib/slots.js'

/**
 * Expire les réservations qui n'ont pas été honorées dans les temps.
 *
 * Deux scénarios couverts :
 *
 *   1. **Legacy `pending`** (modèle "immédiat") : QR émis, casier verrouillé,
 *      mais pas d'ouverture dans les 15 min → `expires_at < now` → expired
 *      + casier libéré (state → idle).
 *
 *   2. **Modèle slots `scheduled`** (PR 0008) : créneau futur réservé, mais
 *      le user n'est pas venu scanner dans la fenêtre de grâce après
 *      `slot_start_at` → expired. Le casier n'avait pas été pré-verrouillé
 *      (les résas scheduled ne lock pas physiquement), donc rien à libérer
 *      côté lockers, mais l'item redevient implicitement dispo pour les
 *      autres slots (via le critère `status IN ('scheduled','pending','active')`
 *      de l'index `idx_reservations_item_slot`).
 *
 * Idempotence : un re-run trouve 0 ligne (les déjà-expirées ne sont plus
 * pending/scheduled). La libération des casiers tolère qu'un casier soit
 * déjà 'idle' (UPDATE sans WHERE state, sûr car la state machine empêche
 * la réservation parallèle).
 *
 * Retourne le nombre total de réservations expirées.
 */
export async function runExpireReservations(log: FastifyBaseLogger): Promise<number> {
  const now = new Date()
  // Cutoff "le user a dépassé la grâce" : équivalent à `slot_start_at +
  // grâce < now`, mais réécrit en `slot_start_at < now - grâce` pour rester
  // dans des comparaisons paramétrées directement par Drizzle (le template
  // `sql` avec `${date}` côté postgres-js ne sérialise pas un Date en bind).
  const graceCutoff = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60 * 1000)
  // Résa créée mais jamais payée : on libère le slot/item après ce délai pour
  // ne pas qu'un panier abandonné tienne un créneau indéfiniment.
  const paymentCutoff = new Date(now.getTime() - env.PAYMENT_TTL_MINUTES * 60 * 1000)

  // Predicate combiné pour traiter pending + scheduled + pending_payment en un
  // seul UPDATE.
  // - pending : expires_at < now
  // - scheduled : slot_start_at < (now - grâce) ET pas de check-in
  //   (`opened_at IS NULL` — sinon la résa est déjà passée à `active`)
  // - pending_payment : créée il y a plus de PAYMENT_TTL_MINUTES sans paiement
  const expired = await db
    .update(reservations)
    .set({ status: 'expired', updatedAt: now })
    .where(or(
      and(
        eq(reservations.status, 'pending'),
        lt(reservations.expiresAt, now),
      ),
      and(
        eq(reservations.status, 'scheduled'),
        isNull(reservations.openedAt),
        lt(reservations.slotStartAt, graceCutoff),
      ),
      and(
        eq(reservations.status, 'pending_payment'),
        lt(reservations.createdAt, paymentCutoff),
      ),
    ))
    .returning({
      id: reservations.id,
      lockerId: reservations.lockerId,
    })

  // Annule les paiements `pending` des résas qu'on vient d'expirer (les
  // pending_payment abandonnées). No-op pour pending/scheduled (pas de
  // paiement pending rattaché). Filtre sur status='pending' → idempotent.
  if (expired.length > 0) {
    await db
      .update(payments)
      .set({ status: 'cancelled', updatedAt: now })
      .where(and(
        inArray(payments.reservationId, expired.map((r) => r.id)),
        eq(payments.status, 'pending'),
      ))
  }

  // Pour les pending legacy, libérer le casier (state reserved → idle).
  // Pour les scheduled, le casier n'est jamais passé en 'reserved' au moment
  // de la résa, donc on saute la libération. On distingue en re-queryant
  // l'état actuel — alternative simple : laisser le UPDATE lockers
  // s'exécuter sur tous (sans WHERE state) : un casier déjà idle reste idle,
  // un casier reserved (legacy) devient idle. Inoffensif sur active/fault
  // car on filtre côté query :
  if (expired.length > 0) {
    await db
      .update(lockers)
      .set({ state: 'idle', lastStateAt: now, updatedAt: now })
      .where(and(
        inArray(lockers.id, expired.map((r) => r.lockerId)),
        eq(lockers.state, 'reserved'),
      ))
  }

  if (expired.length > 0) log.info({ count: expired.length }, 'expired reservations released')
  return expired.length
}
