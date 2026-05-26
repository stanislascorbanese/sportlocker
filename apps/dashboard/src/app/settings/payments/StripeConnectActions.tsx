'use client'

import { ArrowRight, RefreshCw } from 'lucide-react'
import { useTransition } from 'react'

import { cn } from '../../../lib/cn'
import { refreshStatusAction, startOnboardingAction } from './_actions'

/**
 * Boutons CTA pour la page /settings/payments.
 *
 * On utilise `useTransition` plutôt que `<form action={...}>` pour avoir
 * un état `isPending` pendant que la server action s'exécute (la version
 * `<form>` ne donne pas d'état chargement intermédiaire fiable sans
 * `useFormStatus` qui doit vivre dans un form, ce qui complique le layout).
 *
 * Props :
 *   - `connected`  : true si la commune a déjà un Stripe account. Change
 *     le label du CTA principal ("Connecter mon compte" vs "Continuer
 *     la vérification").
 *   - `fullyVerified` : true si charges_enabled && payouts_enabled. Si
 *     true, on ne propose pas re-onboarding, juste le refresh.
 */
export function StripeConnectActions({
  connected,
  fullyVerified,
}: {
  connected: boolean
  fullyVerified: boolean
}) {
  const [isPendingOnboard, startOnboardTransition] = useTransition()
  const [isPendingRefresh, startRefreshTransition] = useTransition()

  function onOnboard() {
    startOnboardTransition(() => {
      startOnboardingAction()
    })
  }

  function onRefresh() {
    startRefreshTransition(() => {
      refreshStatusAction()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!fullyVerified && (
        <button
          type="button"
          onClick={onOnboard}
          disabled={isPendingOnboard}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            'bg-brand-500 text-white hover:bg-brand-400',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isPendingOnboard
            ? 'Redirection vers Stripe…'
            : connected
              ? 'Continuer la vérification'
              : 'Connecter mon compte Stripe'}
          {!isPendingOnboard && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      )}
      {connected && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isPendingRefresh}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition',
            'border-white/15 bg-white/5 text-white/85 hover:border-white/30 hover:bg-white/10',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', isPendingRefresh && 'animate-spin')} aria-hidden />
          {isPendingRefresh ? 'Rafraîchissement…' : 'Rafraîchir le statut'}
        </button>
      )}
    </div>
  )
}
