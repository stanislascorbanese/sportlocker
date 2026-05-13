import { useQuery } from '@tanstack/react-query'

import { fetchDistributor } from '../api/distributors'

export function useDistributorDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['distributor', id],
    queryFn: () => fetchDistributor(id as string),
    enabled: !!id,
    staleTime: 30_000,
  })
}
