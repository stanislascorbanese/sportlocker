'use client'

import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { ActiveReservationBanner } from '../components/ActiveReservationBanner'
import {
  DistributorListItem,
  type DistributorWithDistance,
} from '../components/DistributorListItem'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import {
  fetchActiveReservation,
  fetchAllDistributors,
} from '../lib/api'
import { useRequireAuth } from '../lib/auth-context'
import { MapView } from './map/MapView'

/**
 * Écran d'accueil — carte interactive avec TOUS les distributeurs du parc.
 *
 *   1. Géoloc browser → centre la carte sur l'utilisateur (zoom 13).
 *      Fallback Paris si refusé / indispo.
 *   2. Fetch /v1/distributors (liste complète, pas de filtre rayon).
 *   3. Distance Haversine calculée client-side pour le tri du bottom-sheet.
 *   4. Clic marker / carte → /distributors/:id
 *
 * Les boutons globaux (History/Profile/Logout) qui squattaient le header
 * vivent maintenant dans `<BottomNav>` (rendu globalement via layout.tsx).
 */
export default function HomePage() {
  const user = useRequireAuth()
  const router = useRouter()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Géolocalisation indisponible sur cet appareil.')
      setCoords({ lat: 48.8566, lng: 2.3522 })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setGeoError(err.message)
        setCoords({ lat: 48.8566, lng: 2.3522 })
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    )
  }, [])

  const distributorsQuery = useQuery({
    queryKey: ['distributors-all'],
    queryFn: fetchAllDistributors,
    enabled: Boolean(user),
  })

  // Réservation active courante : surface l'utilisateur en haut de la home
  // pour qu'il retrouve son QR même après avoir quitté l'écran de
  // confirmation. Refetch toutes les 60s pour capter l'expiration / le
  // passage en 'returned' dès que le firmware acknowledge.
  const activeReservationQuery = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })

  const sorted = useMemo<DistributorWithDistance[]>(() => {
    const list = distributorsQuery.data ?? []
    if (!coords) return list.map((d) => ({ ...d, distanceKm: null }))
    return list
      .map((d) => ({
        ...d,
        distanceKm:
          d.latitude != null && d.longitude != null
            ? haversineKm(coords.lat, coords.lng, d.latitude, d.longitude)
            : null,
      }))
      .sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return 0
        if (a.distanceKm == null) return 1
        if (b.distanceKm == null) return -1
        return a.distanceKm - b.distanceKm
      })
  }, [distributorsQuery.data, coords])

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-white/40">Chargement…</p>
      </main>
    )
  }

  const displayName = user.displayName || user.email || user.phoneNumber || 'sportif'
  const firstName = displayName.split(' ')[0]

  return (
    <main className="flex min-h-screen flex-col bg-navy-900 pb-[calc(var(--safe-bottom)+5rem)]">
      <PageHeader
        eyebrow={`Bonjour ${firstName}`}
        title="Distributeurs disponibles"
      />

      {activeReservationQuery.data && (
        <ActiveReservationBanner
          reservation={activeReservationQuery.data}
          onClick={() => router.push(`/reservations/${activeReservationQuery.data!.id}`)}
        />
      )}

      <div className="h-[42vh] max-h-[400px] min-h-[260px] overflow-hidden">
        {coords ? (
          <MapView
            center={coords}
            distributors={distributorsQuery.data ?? []}
            onPick={(id) => router.push(`/distributors/${id}`)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            Localisation en cours…
          </div>
        )}
      </div>

      <section className="flex-1 rounded-t-3xl border-t border-white/10 bg-navy-800 px-5 py-5">
        {geoError && (
          <p className="mb-3 rounded-card border border-amber-400/30 bg-amber-500/10 p-2 text-meta text-amber-200">
            ⚠️ {geoError}. On affiche Paris par défaut.
          </p>
        )}

        <h2 className="mb-3 text-eyebrow font-medium uppercase text-white/55">
          {distributorsQuery.isLoading
            ? 'Chargement…'
            : `${sorted.length} distributeur${sorted.length > 1 ? 's' : ''}`}
        </h2>

        {distributorsQuery.isLoading && (
          <ul className="space-y-2" aria-label="Chargement de la liste">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton height={68} rounded="card" />
              </li>
            ))}
          </ul>
        )}

        {distributorsQuery.error && (
          <ErrorState
            message={(distributorsQuery.error as Error).message}
            onRetry={() => distributorsQuery.refetch()}
          />
        )}

        {!distributorsQuery.isLoading
          && !distributorsQuery.error
          && sorted.length === 0 && (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="Aucun distributeur déployé"
              description="Reviens bientôt — on installe de nouveaux distributeurs chaque semaine."
            />
          )}

        {sorted.length > 0 && (
          <ul className="space-y-2">
            {sorted.map((d) => (
              <DistributorListItem
                key={d.id}
                d={d}
                onPick={(id) => router.push(`/distributors/${id}`)}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

/** Distance Haversine en km entre deux points WGS84. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}
