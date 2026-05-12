import { apiFetch } from './client'

export interface Reservation {
  id: string
  status: 'pending' | 'active' | 'returned' | 'overdue' | 'cancelled' | 'expired'
  lockerId: string
  itemId: string
  distributorId: string
  expiresAt: string
  dueAt: string | null
  extensionCount: number
  qrToken?: string
  nonce?: string
}

export const MAX_EXTENSIONS = 2

export function createReservation(lockerId: string, itemId: string, communeId: string) {
  return apiFetch<Reservation>('/v1/reservations', {
    method: 'POST',
    body: JSON.stringify({ lockerId, itemId, communeId }),
  })
}

export function fetchMyReservations() {
  return apiFetch<{ items: Reservation[] }>('/v1/reservations/me')
}

export function cancelReservation(id: string) {
  return apiFetch<{ ok: true }>(`/v1/reservations/${id}/cancel`, { method: 'POST' })
}

export function extendReservation(id: string) {
  return apiFetch<Reservation>(`/v1/reservations/${id}/extend`, { method: 'PATCH' })
}
