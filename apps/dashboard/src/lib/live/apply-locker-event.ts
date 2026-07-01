import type { DistributorLocker, LiveLockerEvent } from '@sportlocker/types'

/**
 * Applique un event casier temps réel à la liste des casiers d'un distributeur.
 *
 * Le payload `event.locker` est le DTO complet (state + contenu) : on remplace
 * la cellule à l'identique plutôt que de merger des champs partiels, ce qui
 * évite toute ambiguïté d'état intermédiaire. Retourne une nouvelle référence
 * (immutabilité → re-render React fiable) ; l'entrée n'est jamais mutée.
 *
 * Cas d'un casier inconnu (ajout à chaud d'une borne, rare) : on l'insère en
 * conservant l'ordre par `position` pour ne pas casser la grille.
 *
 * Fonction pure : testée sans React.
 */
export function applyLockerEvent(
  lockers: DistributorLocker[],
  event: LiveLockerEvent,
): DistributorLocker[] {
  const idx = lockers.findIndex((l) => l.id === event.locker.id)
  if (idx === -1) {
    return [...lockers, event.locker].sort((a, b) => a.position - b.position)
  }
  // No-op si l'état reçu est déjà celui affiché : on renvoie la même référence
  // pour éviter un re-render inutile (events rejoués côté backend, cf. MQTT
  // idempotent).
  if (lockersEqual(lockers[idx]!, event.locker)) return lockers
  const next = lockers.slice()
  next[idx] = event.locker
  return next
}

function lockersEqual(a: DistributorLocker, b: DistributorLocker): boolean {
  return (
    a.state === b.state
    && a.currentItemId === b.currentItemId
    && (a.itemType?.id ?? null) === (b.itemType?.id ?? null)
  )
}
