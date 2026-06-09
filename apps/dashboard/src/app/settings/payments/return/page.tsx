import { redirect } from 'next/navigation'

import { refreshStripeConnectStatus } from '../../../../lib/api'
import { paymentsStrings } from '../../../../lib/i18n/payments'
import { makeMetadata } from '../../../../lib/i18n/metadata'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => paymentsStrings(lang).metaTitleReturn)

/**
 * Page de redirection servant de `return_url` au flow Stripe Connect
 * AccountLink. Quand l'utilisateur termine (ou abandonne) son onboarding
 * chez Stripe, il atterrit ici.
 *
 * On en profite pour pull le status frais côté Stripe (les flags
 * charges_enabled / payouts_enabled peuvent avoir changé pendant le KYC)
 * puis on redirige immédiatement vers /settings/payments pour que le user
 * voie son badge à jour.
 *
 * Note : Stripe redirige même en cas d'abandon volontaire. Donc atterrir
 * ici ≠ "succès". Le refresh va juste re-pull les vrais flags et la page
 * /settings/payments fera le bon affichage (pending si pas validé).
 *
 * Si refresh fail (typiquement parce que la commune n'a pas d'account
 * Stripe — cas impossible en théorie sur cette URL, mais défensif), on
 * redirige quand même : l'utilisateur verra le bon état sur /payments.
 */
export default async function StripeReturnPage() {
  try {
    await refreshStripeConnectStatus()
  } catch {
    // ignore — la page /payments affichera l'état actuel quoi qu'il arrive
  }
  redirect('/settings/payments')
}
