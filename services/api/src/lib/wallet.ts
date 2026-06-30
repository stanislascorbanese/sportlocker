import { and, eq, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

import { db } from '../db/client.js'
import { payments, walletTopups } from '../db/schema.js'

/**
 * Porte-monnaie prépayé citoyen (carnet/pass — Phase 1).
 *
 * SOLDE = Σ(recharges succeeded) − Σ(dépenses wallet succeeded).
 *   - recharges  : table `wallet_topups` (status='succeeded')
 *   - dépenses   : table `payments` (provider='wallet', status='succeeded')
 *
 * Pas de table « ledger » séparée : les dépenses sont les paiements de
 * location réglés via le solde.
 */

type Runner = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Solde courant du porte-monnaie d'un user, en centimes. */
export async function getWalletBalanceCents(userId: string, runner: Runner = db): Promise<number> {
  const [credit] = await runner
    .select({ sum: sql<number>`COALESCE(SUM(${walletTopups.amountCents}), 0)::int` })
    .from(walletTopups)
    .where(and(eq(walletTopups.userId, userId), eq(walletTopups.status, 'succeeded')))

  const [debit] = await runner
    .select({ sum: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(
      eq(payments.userId, userId),
      eq(payments.provider, 'wallet'),
      eq(payments.status, 'succeeded'),
    ))

  return (credit?.sum ?? 0) - (debit?.sum ?? 0)
}

export type ConfirmTopupResult =
  | { kind: 'ok' }
  | { kind: 'already' }
  | { kind: 'not_found' }

/**
 * Marque une recharge comme réussie (crédite donc le solde, qui est calculé).
 * Idempotent : un webhook redélivré ou un double-clic ne re-crédite pas.
 */
export async function confirmTopup(
  topupId: string,
  log?: FastifyBaseLogger,
): Promise<ConfirmTopupResult> {
  return db.transaction(async (tx) => {
    const [topup] = await tx
      .select({ id: walletTopups.id, status: walletTopups.status })
      .from(walletTopups)
      .where(eq(walletTopups.id, topupId))
      .limit(1)

    if (!topup) return { kind: 'not_found' as const }
    if (topup.status === 'succeeded') return { kind: 'already' as const }

    const now = new Date()
    await tx
      .update(walletTopups)
      .set({ status: 'succeeded', paidAt: now, errorMessage: null, updatedAt: now })
      .where(eq(walletTopups.id, topup.id))

    log?.info({ topupId }, 'wallet topup succeeded')
    return { kind: 'ok' as const }
  })
}

/** Marque une recharge comme échouée (la résa de location n'est pas concernée). */
export async function markTopupFailed(
  topupId: string,
  errorMessage: string | null,
  log?: FastifyBaseLogger,
): Promise<void> {
  const now = new Date()
  await db
    .update(walletTopups)
    .set({ status: 'failed', errorMessage, updatedAt: now })
    .where(and(eq(walletTopups.id, topupId), eq(walletTopups.status, 'pending')))
  log?.info({ topupId }, 'wallet topup failed')
}
