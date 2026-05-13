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

/** Distributeur retourné par /v1/distributors/nearby (lat/lng garantis + distance serveur). */
export interface DistributorNearby extends Omit<Distributor, 'idleLockers' | 'latitude' | 'longitude'> {
  idleLockers: number
  latitude: number
  longitude: number
  distanceKm: number
}

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
  return apiFetch<{ items: DistributorNearby[] }>(`/v1/distributors/nearby?${qs.toString()}`)
}

export function fetchDistributor(id: string) {
  return apiFetch<DistributorDetail>(`/v1/distributors/${id}`)
}
