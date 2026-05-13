import { useQuery } from '@tanstack/react-query'

import { fetchDistributorsNearby } from '../api/distributors'

/**
 * Hook React Query autour de GET /v1/distributors/nearby.
 * `enabled` ne déclenche la requête que si on a des coordonnées (sinon
 * la query reste idle, pas d'appel inutile).
 */
export function useDistributorsNearby(
  lat: number | null,
  lng: number | null,
  radiusKm = 5,
) {
  return useQuery({
    queryKey: ['distributors', 'nearby', lat, lng, radiusKm],
    queryFn: () => fetchDistributorsNearby(lat as number, lng as number, radiusKm),
    enabled: lat !== null && lng !== null,
    staleTime: 30_000,
  })
}
