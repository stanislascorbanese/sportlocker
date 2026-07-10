'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { Loader2, Wallet as WalletIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Card } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import {
  confirmSimulatedTopup,
  createTopup,
  fetchWallet,
  type TopupIntent,
  type Wallet,
} from '../../lib/api'
import { useRequireAuth } from '../../lib/auth-context'
import { useI18n, useT } from '../../lib/i18n/I18nProvider'
import { getStripePromise } from '../../lib/stripe-client'

// Montants de recharge proposés (en centimes) : 5 / 10 / 20 / 50 €.
const TOPUP_AMOUNTS = [500, 1000, 2000, 5000]

function fmtEur(cents: number, locale: 'fr' | 'en'): string {
  return (cents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  })
}

export default function WalletPage() {
  const user = useRequireAuth()
  const t = useT()
  const { locale } = useI18n()
  const queryClient = useQueryClient()

  // `enabled` : on n'interroge le wallet qu'une fois la session présente. Sans
  // ça, la query part au premier paint avant que useRequireAuth ait redirigé →
  // 401 + round-trip de refresh inutile (les autres écrans protégés ont déjà ce
  // garde-fou).
  const walletQuery = useQuery({
    queryKey: ['wallet'],
    queryFn: fetchWallet,
    retry: false,
    enabled: Boolean(user),
  })
  const [intent, setIntent] = useState<TopupIntent | null>(null)

  const topupMutation = useMutation({
    mutationFn: (amountCents: number) => createTopup(amountCents),
    onSuccess: (data) => setIntent(data),
  })

  function onTopupDone() {
    setIntent(null)
    queryClient.invalidateQueries({ queryKey: ['wallet'] })
  }

  if (!user) return null

  const balanceCents = walletQuery.data?.balanceCents ?? 0

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader title={t('wallet.title')} backHref="/profile" backLabel={t('nav.back')} />

      {/* Solde */}
      <Card variant="accent">
        <div className="flex items-center gap-3">
          <WalletIcon className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <div>
            <p className="text-meta text-gray-600 dark:text-white/60">{t('wallet.balance_title')}</p>
            <p className="text-2xl font-semibold tabular-nums text-navy-900 dark:text-white">
              {walletQuery.isPending ? '—' : fmtEur(balanceCents, locale)}
            </p>
          </div>
        </div>
      </Card>

      {/* Recharge */}
      {!intent ? (
        <Card>
          <p className="text-sm font-medium text-navy-900 dark:text-white">{t('wallet.topup_title')}</p>
          <p className="mt-1 text-meta leading-relaxed text-gray-500 dark:text-white/50">
            {t('wallet.topup_hint')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {TOPUP_AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={topupMutation.isPending}
                onClick={() => topupMutation.mutate(amount)}
                className="rounded-xl border px-4 py-3 text-sm font-semibold tabular-nums transition-colors duration-base border-gray-200 bg-white text-navy-900 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-emerald-400/60"
              >
                {fmtEur(amount, locale)}
              </button>
            ))}
          </div>
          {topupMutation.isPending && (
            <p className="mt-2 flex items-center gap-2 text-meta text-gray-500 dark:text-white/50">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('payment.processing')}
            </p>
          )}
          {topupMutation.error && (
            <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">{t('wallet.topup_error')}</p>
          )}
        </Card>
      ) : intent.provider === 'simulate' ? (
        <SimulateTopupPanel topupId={intent.topupId} onDone={onTopupDone} />
      ) : intent.clientSecret ? (
        <Elements stripe={getStripePromise()} options={{ clientSecret: intent.clientSecret, locale }}>
          <StripeTopupPanel onDone={onTopupDone} />
        </Elements>
      ) : (
        <Card>
          <p className="text-sm text-rose-700 dark:text-rose-200">{t('payment.stripe_unavailable')}</p>
        </Card>
      )}

      {/* Historique des transactions : recharges (+) et locations débitées (−),
          fusionnées et triées du plus récent au plus ancien. */}
      {walletQuery.data && (() => {
        const txns = buildTransactions(walletQuery.data)
        if (txns.length === 0) return null
        return (
          <Card>
            <p className="text-sm font-medium text-navy-900 dark:text-white">
              {t('wallet.transactions_title')}
            </p>
            <ul className="mt-2 divide-y divide-gray-100 dark:divide-white/5">
              {txns.map((txn) => (
                <TransactionRow key={txn.key} txn={txn} locale={locale} />
              ))}
            </ul>
          </Card>
        )
      })()}
    </main>
  )
}

type Transaction = {
  key: string
  date: string | null
  amountCents: number
  kind: 'topup' | 'spend'
  status?: Wallet['topups'][number]['status']
  reservationId?: string
}

/**
 * Fusionne recharges + dépenses en un flux chronologique unique. Les recharges
 * portent leur statut (une recharge Stripe reste `pending` tant que le webhook
 * n'a pas crédité) ; les dépenses (`payments` provider=wallet) sont toujours
 * abouties donc affichées sans statut. Tri décroissant par date.
 */
function buildTransactions(wallet: Wallet): Transaction[] {
  const topups: Transaction[] = wallet.topups.map((tp) => ({
    key: `topup-${tp.id}`,
    date: tp.createdAt,
    amountCents: tp.amountCents,
    kind: 'topup',
    status: tp.status,
  }))
  const spends: Transaction[] = wallet.spends.map((sp, i) => ({
    key: `spend-${sp.reservationId}-${i}`,
    date: sp.paidAt,
    amountCents: sp.amountCents,
    kind: 'spend',
    reservationId: sp.reservationId,
  }))
  return [...topups, ...spends].sort(
    (a, b) => (b.date ? new Date(b.date).getTime() : 0) - (a.date ? new Date(a.date).getTime() : 0),
  )
}

function TransactionRow({ txn, locale }: { txn: Transaction; locale: 'fr' | 'en' }) {
  const t = useT()
  const isTopup = txn.kind === 'topup'
  const dateLabel = txn.date
    ? new Date(txn.date).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        day: '2-digit', month: 'short',
      })
    : '—'

  const inner = (
    <div className="flex items-center gap-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-navy-900 dark:text-white">
          {t(isTopup ? 'wallet.txn.topup' : 'wallet.txn.spend')}
        </p>
        <p className="text-meta text-gray-500 dark:text-white/50">{dateLabel}</p>
      </div>
      {isTopup && txn.status !== 'succeeded' && (
        <span className="text-meta text-gray-400 dark:text-white/40">
          {t(`wallet.status.${txn.status ?? 'pending'}` as 'wallet.status.succeeded')}
        </span>
      )}
      <span
        className={
          isTopup
            ? 'shrink-0 tabular-nums font-semibold text-emerald-700 dark:text-emerald-300'
            : 'shrink-0 tabular-nums font-medium text-navy-900 dark:text-white'
        }
      >
        {isTopup ? '+' : '−'}{fmtEur(txn.amountCents, locale)}
      </span>
    </div>
  )

  if (!isTopup && txn.reservationId) {
    return (
      <li>
        <Link
          href={`/reservations/${txn.reservationId}`}
          className="block transition-colors duration-base hover:bg-gray-50 dark:hover:bg-white/5"
        >
          {inner}
        </Link>
      </li>
    )
  }
  return <li>{inner}</li>
}

function SimulateTopupPanel({ topupId, onDone }: { topupId: string; onDone: () => void }) {
  const t = useT()
  const confirmMutation = useMutation({
    mutationFn: () => confirmSimulatedTopup(topupId),
    onSuccess: onDone,
  })
  return (
    <Card>
      <p className="text-meta leading-relaxed text-gray-500 dark:text-white/45">
        {t('payment.simulate_notice')}
      </p>
      <button
        type="button"
        disabled={confirmMutation.isPending}
        onClick={() => confirmMutation.mutate()}
        className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-base bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
      >
        {confirmMutation.isPending ? t('payment.processing') : t('payment.simulate_btn')}
      </button>
      {confirmMutation.error && (
        <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">{t('wallet.topup_error')}</p>
      )}
    </Card>
  )
}

function StripeTopupPanel({ onDone }: { onDone: () => void }) {
  const t = useT()
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}`,
      },
      redirect: 'if_required',
    })
    if (stripeError) {
      setError(stripeError.message ?? t('payment.error'))
      setSubmitting(false)
      return
    }
    if (paymentIntent?.status === 'succeeded') {
      // Le solde est crédité par le webhook (asynchrone) : on affiche
      // « finalisation » puis on rafraîchit le solde via onDone.
      setFinalizing(true)
      setTimeout(onDone, 1500)
      return
    }
    setError(t('payment.error'))
    setSubmitting(false)
  }

  if (finalizing) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t('payment.finalizing')}
      </div>
    )
  }

  return (
    <Card>
      <PaymentElement
        options={{ defaultValues: { billingDetails: { address: { country: 'FR' } } } }}
      />
      <button
        type="button"
        disabled={!stripe || submitting}
        onClick={handlePay}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-base bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
      >
        {submitting
          ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('payment.processing')}</>
          : t('wallet.topup_pay')}
      </button>
      {error && <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">{error}</p>}
    </Card>
  )
}
