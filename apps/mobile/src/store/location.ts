import { create } from 'zustand'
import * as Location from 'expo-location'

const PARIS_FALLBACK = { latitude: 48.8566, longitude: 2.3522 }

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'fallback'

interface LocationState {
  coords: { latitude: number; longitude: number } | null
  status: LocationStatus
  /** Message à afficher quand on retombe sur le fallback (refus / pos indispo). */
  fallbackReason: string | null
  /** Demande la permission + récupère la position. Bascule en fallback Paris sinon. */
  requestPermission: () => Promise<void>
  /** Récupère une nouvelle position (suppose la permission déjà accordée). */
  refresh: () => Promise<void>
}

export const useLocationStore = create<LocationState>((set, get) => ({
  coords: null,
  status: 'idle',
  fallbackReason: null,

  requestPermission: async () => {
    set({ status: 'requesting', fallbackReason: null })
    const { status: perm } = await Location.requestForegroundPermissionsAsync()
    if (perm !== 'granted') {
      set({
        coords: PARIS_FALLBACK,
        status: 'fallback',
        fallbackReason: 'Géoloc refusée — résultats centrés sur Paris',
      })
      return
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      set({
        coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
        status: 'granted',
        fallbackReason: null,
      })
    } catch {
      set({
        coords: PARIS_FALLBACK,
        status: 'fallback',
        fallbackReason: 'Position indisponible — résultats centrés sur Paris',
      })
    }
  },

  refresh: async () => {
    if (get().status !== 'granted') {
      await get().requestPermission()
      return
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      set({ coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude } })
    } catch {
      // On garde la dernière position connue.
    }
  },
}))
