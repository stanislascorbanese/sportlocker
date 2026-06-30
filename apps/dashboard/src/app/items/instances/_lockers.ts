import { fetchDistributor, fetchDistributors } from '../../../lib/api'
import type { LockerOption } from '../ItemForm'

/**
 * Récupère la liste plate de tous les casiers de tous les distributeurs.
 * Utilisé par les formulaires d'article pour proposer un emplacement.
 *
 * Coût : 1 + N requêtes (N = nombre de distributeurs visibles). Acceptable
 * tant que N < quelques dizaines — au-delà il faudra une route API dédiée
 * /v1/admin/lockers paginée.
 */
export async function fetchAllLockerOptions(): Promise<LockerOption[]> {
  const distributors = await fetchDistributors()
  const details = await Promise.all(
    distributors.map(async (d) => {
      try {
        return await fetchDistributor(d.id)
      } catch {
        return null
      }
    }),
  )

  const out: LockerOption[] = []
  for (const d of details) {
    if (!d) continue
    for (const l of d.lockers) {
      out.push({
        id: l.id,
        position: l.position,
        distributorId: d.id,
        distributorName: d.name,
        distributorSerial: d.serialNumber,
        state: l.state,
      })
    }
  }
  return out
}
