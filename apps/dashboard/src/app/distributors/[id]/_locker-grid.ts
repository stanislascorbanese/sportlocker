import type { DistributorLocker } from '../../../lib/api'

export type LockerCellTone = 'idle-empty' | 'idle-loaded' | 'reserved' | 'active' | 'returning' | 'fault'

export type LockerCell = {
  locker: DistributorLocker
  tone: LockerCellTone
  /** True si l'opérateur peut charger un nouvel article ici (idle + vide). */
  loadable: boolean
}

/**
 * Catégorise chaque casier pour le rendu de la grille :
 *  - idle + vide  → "loadable" (pastille cliquable pour charger)
 *  - idle + plein → loaded (item présent, dispo pour réservation)
 *  - reserved     → bloqué pour un user, item dedans
 *  - active       → user a ouvert + emprunté
 *  - returning    → en cours de retour
 *  - fault        → casier en panne (à exclure du parc utile)
 */
export function classifyLocker(l: DistributorLocker): LockerCell {
  if (l.state === 'idle') {
    const empty = l.currentItemId == null
    return {
      locker: l,
      tone: empty ? 'idle-empty' : 'idle-loaded',
      loadable: empty,
    }
  }
  return {
    locker: l,
    tone: l.state,
    loadable: false,
  }
}

export type LockerGridSummary = {
  total: number
  idleEmpty: number
  idleLoaded: number
  reserved: number
  active: number
  returning: number
  fault: number
  loadable: number
}

export function summarizeLockerGrid(lockers: DistributorLocker[]): LockerGridSummary {
  const summary: LockerGridSummary = {
    total: lockers.length,
    idleEmpty: 0, idleLoaded: 0,
    reserved: 0, active: 0, returning: 0, fault: 0,
    loadable: 0,
  }
  for (const l of lockers) {
    const cell = classifyLocker(l)
    if (cell.tone === 'idle-empty')  summary.idleEmpty  += 1
    if (cell.tone === 'idle-loaded') summary.idleLoaded += 1
    if (cell.tone === 'reserved')    summary.reserved   += 1
    if (cell.tone === 'active')      summary.active     += 1
    if (cell.tone === 'returning')   summary.returning  += 1
    if (cell.tone === 'fault')       summary.fault      += 1
    if (cell.loadable)               summary.loadable   += 1
  }
  return summary
}

/** Filtre les casiers où on PEUT charger un nouvel article : idle + vide. */
export function loadableLockers(lockers: DistributorLocker[]): DistributorLocker[] {
  return lockers.filter((l) => l.state === 'idle' && l.currentItemId == null)
}
