import type {
  Distributor,
  DistributorDetail,
  DistributorLocker,
  NearbyDistributor,
} from '@sportlocker/types'

import { apiFetch } from './client'

export type { Distributor, DistributorDetail, DistributorLocker, NearbyDistributor }

/** Liste complète du parc (route legacy — préférer `fetchDistributorsNearby`). */
export function fetchDistributors() {
  return apiFetch<{ items: Distributor[] }>('/v1/distributors')
}

/**
 * Filtre + tri serveur : retourne les distributeurs dans `radiusKm` autour
 * de (lat,lng), triés par distance croissante. La route API utilise Haversine
 * SQL pur (Postgres vanilla, pas d'earthdistance).
 */
export function fetchDistributorsNearby(lat: number, lng: number, radiusKm = 5) {
  const qs = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius_km: String(radiusKm),
  })
  return apiFetch<{ items: NearbyDistributor[] }>(`/v1/distributors/nearby?${qs.toString()}`)
}

export function fetchDistributor(id: string) {
  return apiFetch<DistributorDetail>(`/v1/distributors/${id}`)
}
