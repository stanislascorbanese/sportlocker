import { create } from 'zustand'

import type { Distributor } from '../api/distributors'

/**
 * Vue mobile : distributeur géolocalisé avec stock courant.
 * - latitude / longitude doivent être renseignés (filtre à l'insertion).
 * - idleLockers : défaut lockerCount si l'API ne l'expose pas encore
 *   (la route /v1/distributors actuelle ne le calcule pas, seul /:id le fait).
 */
export interface DistributorWithGeo extends Distributor {
  latitude: number
  longitude: number
  idleLockers: number
}

function normalize(d: Distributor): DistributorWithGeo | null {
  if (d.latitude == null || d.longitude == null) return null
  return {
    ...d,
    latitude: d.latitude,
    longitude: d.longitude,
    idleLockers: d.idleLockers ?? d.lockerCount,
  }
}

interface DistributorsState {
  byId: Record<string, DistributorWithGeo>
  setAll: (list: Distributor[]) => void
  upsert: (d: Distributor) => void
  patchStock: (id: string, idleLockers: number) => void
  patchStatus: (id: string, status: Distributor['status']) => void
}

export const useDistributorsStore = create<DistributorsState>((set) => ({
  byId: {},
  setAll: (list) => {
    const entries = list
      .map(normalize)
      .filter((d): d is DistributorWithGeo => d !== null)
      .map((d) => [d.id, d] as const)
    set({ byId: Object.fromEntries(entries) })
  },
  upsert: (d) => {
    const norm = normalize(d)
    if (!norm) return
    set((s) => ({ byId: { ...s.byId, [norm.id]: norm } }))
  },
  patchStock: (id, idleLockers) =>
    set((s) => {
      const prev = s.byId[id]
      if (!prev) return s
      return { byId: { ...s.byId, [id]: { ...prev, idleLockers } } }
    }),
  patchStatus: (id, status) =>
    set((s) => {
      const prev = s.byId[id]
      if (!prev) return s
      return { byId: { ...s.byId, [id]: { ...prev, status } } }
    }),
}))
