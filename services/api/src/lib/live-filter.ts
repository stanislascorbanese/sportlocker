import type { LiveEvent } from '@sportlocker/types'

/** Portée d'un client WS : commune (null = super_admin) + filtre distributeur optionnel. */
export interface LiveClientScope {
  /** null = super_admin (reçoit toutes les communes) ; sinon commune scopée. */
  communeId: string | null
  /** Si défini, le client ne veut que ce distributeur (page détail). */
  distributorId: string | null
}

/**
 * Décide si un event doit être poussé à un client donné. Fonction pure (testée
 * sans Redis ni socket).
 *
 * - Scope commune : super_admin (communeId null) reçoit tout ; un admin
 *   uniquement les events de sa commune. C'est la barrière multi-tenant du flux.
 * - Filtre distributeur : si le client s'est abonné à un distributeur précis, on
 *   ne lui pousse que celui-là.
 */
export function shouldDeliver(client: LiveClientScope, event: LiveEvent): boolean {
  if (client.communeId !== null && client.communeId !== event.communeId) return false
  if (client.distributorId !== null && client.distributorId !== event.distributorId) return false
  return true
}
