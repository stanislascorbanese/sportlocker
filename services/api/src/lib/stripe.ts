import Stripe from 'stripe'

import { env } from '../config/env.js'

/**
 * Wrapper Stripe SDK lazy-initialisé. La clé `STRIPE_SECRET_KEY` est optional
 * dans l'env — l'API démarre sans, mais les routes qui en ont besoin renvoient
 * 503 (cf. `requireStripe` ci-dessous). Ça évite que les déploiements Railway
 * sans clé Stripe configurée plantent au boot.
 *
 * Pattern singleton : on cache l'instance pour ne pas re-init le SDK à chaque
 * requête (la lib ouvre un pool HTTP keepalive en interne).
 *
 * apiVersion pinnée à la version courante au moment du dev (mai 2026). Stripe
 * upgrade leur API ~2-3 fois/an avec des breaking changes ; mieux vaut pinner
 * explicitement que se faire surprendre par un changement de schéma silencieux.
 */
// Pinné à la version supportée par le SDK installé (stripe@15.x → 2024-04-10).
// Quand on bump le SDK, vérifier `Stripe.LatestApiVersion` dans
// node_modules/.pnpm/stripe@*/node_modules/stripe/types/lib.d.ts et aligner ici.
const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-04-10'

let _stripe: Stripe | null = null

export function getStripe(): Stripe | null {
  if (_stripe) return _stripe
  if (!env.STRIPE_SECRET_KEY) return null
  _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    // Identité du SDK dans les logs Stripe Dashboard → on retrouve facilement
    // les requêtes de cet env (utile pour debug + revoke d'une clé compromise).
    appInfo: {
      name: 'SportLocker API',
      version: '0.1.0',
      url: 'https://api.sportlocker.fr',
    },
  })
  return _stripe
}

/**
 * Renvoie l'instance Stripe ou throw — pour les handlers qui ne peuvent pas
 * fonctionner sans Stripe (vs un retry plus tard). Le handler doit catch et
 * répondre 503 avec un message clair.
 */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super('Stripe is not configured. Set STRIPE_SECRET_KEY in env.')
    this.name = 'StripeNotConfiguredError'
  }
}

export function requireStripe(): Stripe {
  const stripe = getStripe()
  if (!stripe) throw new StripeNotConfiguredError()
  return stripe
}

/**
 * Reset le singleton — pour les tests (vi.mock('stripe', ...) suivi de
 * resetStripeForTests() entre tests pour repartir d'une instance fraîche).
 *
 * Ne PAS appeler en prod.
 */
export function resetStripeForTests(): void {
  _stripe = null
}
