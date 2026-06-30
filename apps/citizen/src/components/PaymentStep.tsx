'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { CreditCard, Loader2, ShieldCheck, Wallet as WalletIcon } from 'lucide-react'
import { useState } from 'react'

import { Card } from './ui/Card'
import {
  confirmSimulatedPayment,
  createPaymentIntent,
  fetchWallet,
  payReservationWithWallet,
  type ReservationActive,
} from '../lib/api'
import { useI18n, useT } from '../lib/i18n/I18nProvider'
import { getStripePromise } from '../lib/stripe-client'

/**
 * Étape de paiement d'une réservation `pending_payment`.
 *
 * Crée (ou réutilise, idempotent) un PaymentIntent côté API au montage. Selon
 * le provider renvoyé :
 *   - `simulate` → bouton qui confirme directement (aucun Stripe, dev/staging).
 *   - `stripe`   → Stripe Elements (PaymentElement) + confirmation carte.
 *
 * Dans les deux cas, le succès invalide `reservation-active` : le parent
 * refait un GET /active, voit la résa passée `scheduled` et affiche le QR.
 * Pour Stripe, le passage `pending_payment → scheduled` est asynchrone
 * (webhook), d'où l'état « finalisation » + polling rapide côté parent.
 */

function fmtAmount(cents: number, locale: 'fr' | 'en', tFree: string): string {
  if (cents === 0) return tFree
  return `${(cents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 2,
  })} €`
}

export function PaymentStep({ reservation }: { reservation: ReservationActive }) {
  const t = useT()
  const { locale } = useI18n()
  const priceCents = reservation.priceCents ?? 0
  const amountLabel = fmtAmount(priceCents, locale, t('booking.free'))

  // Solde porte-monnaie : si suffisant, on propose le paiement « par crédit »
  // (synchrone, 0 frais Stripe) en plus du paiement classique.
  const walletQuery = useQuery({ queryKey: ['wallet'], queryFn: fetchWallet, retry: false })
  const balanceCents = walletQuery.data?.balanceCents ?? 0
  const canPayWithWallet = priceCents > 0 && balanceCents >= priceCents

  const intentQuery = useQuery({
    queryKey: ['payment-intent', reservation.id],
    queryFn: () => createPaymentIntent(reservation.id),
    enabled: Boolean(reservation.id),
    staleTime: Infinity,
    retry: false,
  })

  return (
    <>
      <Card variant="accent">
        <div className="flex items-start gap-3">
          <CreditCard
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-navy-900 dark:text-white">
              {t('payment.title')}
            </p>
            <p className="mt-0.5 text-meta text-gray-600 dark:text-white/60">
              {reservation.item.typeName} · {reservation.distributor.name}
            </p>
            <p className="mt-2 text-base font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
              {amountLabel}
            </p>
          </div>
        </div>
      </Card>

      {canPayWithWallet && (
        <WalletPanel
          reservationId={reservation.id}
          balanceLabel={fmtAmount(balanceCents, locale, t('booking.free'))}
        />
      )}

      {intentQuery.isPending && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500 dark:text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t('payment.processing')}
        </div>
      )}

      {intentQuery.error && (
        <Card>
          <p className="text-sm text-rose-700 dark:text-rose-200">{t('payment.init_error')}</p>
          <button
            type="button"
            onClick={() => intentQuery.refetch()}
            className="mt-3 w-full rounded-xl border px-4 py-3 text-sm font-medium transition-colors duration-base border-gray-200 bg-white hover:border-gray-300 dark:border-white/15 dark:bg-white/5 dark:hover:border-white/30"
          >
            {t('payment.retry')}
          </button>
        </Card>
      )}

      {intentQuery.data?.provider === 'simulate' && (
        <SimulatePanel reservationId={reservation.id} />
      )}

      {intentQuery.data?.provider === 'stripe'
        && (intentQuery.data.clientSecret
          ? (
            <Elements
              stripe={getStripePromise()}
              options={{ clientSecret: intentQuery.data.clientSecret, locale }}
            >
              <StripePanel reservationId={reservation.id} amountLabel={amountLabel} />
            </Elements>
          )
          : (
            <Card>
              <p className="text-sm text-rose-700 dark:text-rose-200">
                {t('payment.stripe_unavailable')}
              </p>
            </Card>
          ))}

      <p className="text-center text-meta leading-relaxed text-gray-500 dark:text-white/40">
        {t('payment.help')}
      </p>
    </>
  )
}

function WalletPanel({
  reservationId,
  balanceLabel,
}: {
  reservationId: string
  balanceLabel: string
}) {
  const t = useT()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const payMutation = useMutation({
    mutationFn: () => payReservationWithWallet(reservationId),
    onSuccess: () => {
      // Paiement wallet = synchrone (pas de webhook) : la résa est déjà
      // scheduled, on rafraîchit solde + résa pour afficher le QR.
      queryClient.invalidateQueries({ queryKey: ['wallet'] })
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
    },
    onError: () => setError(t('wallet.pay_error')),
  })

  return (
    <Card variant="accent">
      <div className="flex items-start gap-3">
        <WalletIcon
          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-navy-900 dark:text-white">
            {t('wallet.pay_title')}
          </p>
          <p className="mt-0.5 text-meta text-gray-600 dark:text-white/60">
            {t('wallet.balance_label', { amount: balanceLabel })}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={payMutation.isPending}
        onClick={() => { setError(null); payMutation.mutate() }}
        className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-base bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
      >
        {payMutation.isPending ? t('payment.processing') : t('wallet.pay_btn')}
      </button>
      {error && (
        <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">{error}</p>
      )}
    </Card>
  )
}

function SimulatePanel({ reservationId }: { reservationId: string }) {
  const t = useT()
  const queryClient = useQueryClient()

  const confirmMutation = useMutation({
    mutationFn: () => confirmSimulatedPayment(reservationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
    },
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
        <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">
          {t('payment.error')}
        </p>
      )}
    </Card>
  )
}

function StripePanel({
  reservationId,
  amountLabel,
}: {
  reservationId: string
  amountLabel: string
}) {
  const t = useT()
  const stripe = useStripe()
  const elements = useElements()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  async function handlePay() {
    if (!stripe || !elements) return
    setSubmitting(true)
    setError(null)
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      // `return_url` est obligatoire pour les moyens à redirection (PayPal,
      // Klarna…). Avec `redirect: 'if_required'`, la carte reste inline (pas de
      // redirection, return_url ignoré) ; PayPal/Klarna redirigent ici puis
      // reviennent sur l'écran de réservation, qui poll `/reservations/active`
      // et affiche le QR une fois la résa passée `scheduled` via le webhook.
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
      // Le webhook bascule la résa en `scheduled` de façon asynchrone : on
      // passe en « finalisation » et on laisse le polling parent récupérer le QR.
      setFinalizing(true)
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
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
          : <><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t('payment.pay_btn', { amount: amountLabel })}</>}
      </button>
      {error && (
        <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">{error}</p>
      )}
    </Card>
  )
}
