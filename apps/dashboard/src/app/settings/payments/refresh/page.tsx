import { redirect } from 'next/navigation'

import { startStripeConnectOnboarding } from '../../../../lib/api'
import { paymentsStrings } from '../../../../lib/i18n/payments'
import { makeMetadata } from '../../../../lib/i18n/metadata'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => paymentsStrings(lang).metaTitleRefresh)

/**
 * Page de redirection servant de `refresh_url` au flow Stripe Connect
 * AccountLink. Stripe redirige ici si l'AccountLink expire pendant que
 * l'utilisateur est sur leur flow (par défaut 5 min de validité).
 *
 * On crée immédiatement un nouvel AccountLink et on redirige le user
 * vers Stripe pour qu'il reprenne là où il s'est arrêté. Comme l'Account
 * Express existe déjà côté Stripe (créé au premier `onboard`), `startStripeConnectOnboarding`
 * va le réutiliser et juste générer un nouveau lien — pas de doublon.
 *
 * Cas d'erreur (rare) : si startOnboarding fail, on redirige vers
 * /settings/payments où l'utilisateur verra l'état + le bouton "Continuer"
 * pour relancer le flow proprement.
 */
export default async function StripeRefreshPage() {
  try {
    const { url } = await startStripeConnectOnboarding()
    redirect(url)
  } catch {
    redirect('/settings/payments')
  }
}
