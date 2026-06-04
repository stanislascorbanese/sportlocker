import Stripe from 'stripe'

import { env } from '../config/env.js'

/**
 * Client Stripe singleton, instancié à la demande (lazy).
 *
 * N'est jamais construit en mode `simulate` : les routes paiement aiguillent
 * sur le provider avant d'appeler ce module. Le garde-fou boot (cf. env.ts)
 * garantit que STRIPE_SECRET_KEY est présent dès lors que
 * PAYMENTS_PROVIDER=stripe, donc le `!` est sûr ici.
 */
let client: Stripe | null = null

export function getStripe(): Stripe {
  if (env.PAYMENTS_PROVIDER !== 'stripe') {
    throw new Error('getStripe() appelé alors que PAYMENTS_PROVIDER !== "stripe"')
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY!)
  }
  return client
}
