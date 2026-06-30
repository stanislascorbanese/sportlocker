'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import {
  refreshStripeConnectStatus,
  startStripeConnectOnboarding,
} from '../../../lib/api'

/**
 * Server actions consommées par `StripeConnectActions.tsx`.
 *
 * On utilise des server actions plutôt qu'un fetch client-side pour :
 *   - garder le cookie session côté serveur (`authHeaders()` dans api.ts
 *     lit `cookies()` qui n'est dispo qu'en server context)
 *   - éviter d'exposer une route API publique côté Next.js juste pour
 *     proxy l'appel backend
 *   - bénéficier du `revalidatePath` natif pour re-render la page après
 *     update sans gérer manuellement un state React Query
 */

export async function startOnboardingAction(): Promise<void> {
  const { url } = await startStripeConnectOnboarding()
  // Redirect vers l'URL Stripe-hosted. `redirect()` throw NEXT_REDIRECT
  // qui est intercepté par Next et déclenche un 307 — le browser suit
  // automatiquement.
  redirect(url)
}

export async function refreshStatusAction(): Promise<void> {
  await refreshStripeConnectStatus()
  // Re-fetch la page pour afficher les nouveaux flags.
  revalidatePath('/settings/payments')
}
