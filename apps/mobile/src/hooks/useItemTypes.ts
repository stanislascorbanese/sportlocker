import { useQuery } from '@tanstack/react-query'

import { fetchItemTypes } from '../api/item-types'

/**
 * Catalogue d'item_types. staleTime long (5 min) car ce catalogue change
 * rarement — utilisé pour peupler des filtres ou des libellés UI.
 */
export function useItemTypes(params: { limit?: number; offset?: number } = {}) {
  return useQuery({
    queryKey: ['item-types', params.limit ?? null, params.offset ?? null],
    queryFn: () => fetchItemTypes(params),
    staleTime: 5 * 60_000,
  })
}
