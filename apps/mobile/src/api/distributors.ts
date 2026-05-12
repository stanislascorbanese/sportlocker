import { apiFetch } from './client'

export type DistributorStatus = 'online' | 'offline' | 'maintenance' | 'decommissioned'
export type LockerState = 'idle' | 'reserved' | 'active' | 'returning' | 'fault'

export interface Distributor {
  id: string
  serialNumber: string
  name: string
  status: DistributorStatus
  communeId: string
  lockerCount: number
  /** Renseigné par /v1/distributors/:id (calcul côté API). Absent de la liste. */
  idleLockers?: number
  latitude: number | null
  longitude: number | null
  lastSeenAt: string | null
}

export interface DistributorLocker {
  id: string
  position: number
  state: LockerState
  currentItemId: string | null
}

export interface DistributorDetail extends Distributor {
  lockers: DistributorLocker[]
}

/**
 * Liste complète du parc — pas de filtre côté serveur pour l'instant.
 * Le tri par distance se fait dans map.tsx (Haversine app-side).
 * TODO: passer en /v1/distributors?lat=...&lng=...&radius=... quand l'endpoint
 * de géofiltrage sera implémenté côté API.
 */
export function fetchDistributors() {
  return apiFetch<{ items: Distributor[] }>('/v1/distributors')
}

export function fetchDistributor(id: string) {
  return apiFetch<DistributorDetail>(`/v1/distributors/${id}`)
}
