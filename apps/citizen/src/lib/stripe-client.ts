import { loadStripe, type Stripe } from '@stripe/stripe-js'

/**
 * Singleton Stripe.js partagé (paiement de location + recharge porte-monnaie).
 * La clé publishable est bakée au build (NEXT_PUBLIC_*). Sans clé, on renvoie
 * une promesse résolue à null → les écrans dégradent proprement.
 */
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''

let stripePromise: Promise<Stripe | null> | null = null

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise && PUBLISHABLE_KEY) {
    stripePromise = loadStripe(PUBLISHABLE_KEY)
  }
  return stripePromise ?? Promise.resolve(null)
}
