import { apiFetch } from './client'

export interface ItemType {
  id: string
  slug: string
  name: string
  category: string
  description: string | null
  imageUrl: string | null
  cautionCents: number
  maxDurationMinutes: number
}

export interface ItemTypesPage {
  items: ItemType[]
  total: number
  limit: number
  offset: number
}

/** Catalogue paginé — route publique, pas d'auth. */
export function fetchItemTypes(params: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  const suffix = qs.toString()
  return apiFetch<ItemTypesPage>(`/v1/item-types${suffix ? `?${suffix}` : ''}`)
}
