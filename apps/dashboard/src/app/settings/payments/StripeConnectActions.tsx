'use client'

import { ArrowRight, RefreshCw } from 'lucide-react'
import { useTransition } from 'react'

import { Button } from '../../../components/ui/Button'
import { refreshStatusAction, startOnboardingAction } from './_actions'

/**
 * Boutons CTA pour la page /settings/payments.
 *
 * On utilise `useTransition` plutôt que `<form action={...}>` pour avoir
 * un état `isPending` pendant que la server action s'exécute (la version
 * `<form>` ne donne pas d'état chargement intermédiaire fiable sans
 * `useFormStatus` qui doit vivre dans un form, ce qui complique le layout).
 *
 * Refactor C2 : utilise l'atome `<Button>` du design system dashboard
 * (variant primary / secondary, loading state intégré).
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
        <Button
          variant="primary"
          onClick={onOnboard}
          loading={isPendingOnboard}
          icon={!isPendingOnboard ? undefined : undefined}
        >
          {isPendingOnboard
            ? 'Redirection vers Stripe…'
            : connected
              ? 'Continuer la vérification'
              : 'Connecter mon compte Stripe'}
          {!isPendingOnboard && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      )}
      {connected && (
        <Button
          variant="secondary"
          onClick={onRefresh}
          loading={isPendingRefresh}
          icon={!isPendingRefresh ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : undefined}
        >
          {isPendingRefresh ? 'Rafraîchissement…' : 'Rafraîchir le statut'}
        </Button>
      )}
    </div>
  )
}
