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
import { HeaderActions } from '../components/HeaderActions'
import { OnboardingSheet } from '../components/OnboardingSheet'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { PageHeader } from '../components/ui/PageHeader'
import { Skeleton } from '../components/ui/Skeleton'
import {
  fetchActiveReservation,
  fetchAllDistributors,
} from '../lib/api'
import { useRequireAuth } from '../lib/auth-context'
import { useT } from '../lib/i18n/I18nProvider'
import { MapView } from './map/MapView'

/**
 * Écran d'accueil — carte interactive + liste triée par distance.
 *
 *   1. Géoloc browser → centre la carte sur l'utilisateur (zoom 13).
 *      Fallback Paris si refusé / indispo.
 *   2. Fetch /v1/distributors (liste complète, pas de filtre rayon).
 *   3. Distance Haversine calculée client-side pour le tri.
 *   4. Clic marker / cellule → /distributors/:id
 */
export default function HomePage() {
  const user = useRequireAuth()
  const router = useRouter()
  const t = useT()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError(t('home.geo_error', { error: 'Géolocalisation indisponible' }))
      setCoords({ lat: 48.8566, lng: 2.3522 })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setGeoError(t('home.geo_error', { error: err.message }))
        setCoords({ lat: 48.8566, lng: 2.3522 })
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    )
    // t change quand la locale change — recalcule le message.
  }, [t])

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
      <main className="flex min-h-screen items-center justify-center bg-white dark:bg-navy-900">
        <p className="text-sm text-gray-400 dark:text-white/40">{t('home.loading')}</p>
      </main>
    )
  }

  const displayName = user.displayName || user.email || user.phoneNumber || 'sportif'
  const firstName = displayName.split(' ')[0] ?? displayName
  const count = sorted.length

  return (
    <main className="flex min-h-screen flex-col bg-white pb-[calc(var(--safe-bottom)+1rem)] dark:bg-navy-900">
      <PageHeader
        eyebrow={t('home.greeting', { name: firstName })}
        title={t('home.title')}
        actions={<HeaderActions />}
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
          <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-white/50">
            {t('home.locating')}
          </div>
        )}
      </div>

      <section className="flex-1 rounded-t-3xl border-t bg-gray-50 px-5 py-5 border-gray-200 dark:border-white/10 dark:bg-navy-800">
        {geoError && (
          <p className="mb-3 rounded-card border p-2 text-meta border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            ⚠️ {geoError}
          </p>
        )}

        <h2 className="mb-3 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
          {distributorsQuery.isLoading
            ? t('home.loading')
            : count === 1
              ? t('home.count_one')
              : t('home.count_many', { count })}
        </h2>

        {distributorsQuery.isLoading && (
          <ul className="space-y-2" aria-label={t('home.loading')}>
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <Skeleton height={68} rounded="card" />
              </li>
            ))}
          </ul>
        )}

        {distributorsQuery.error && (
          <ErrorState
            title={t('ui.error.generic_title')}
            message={(distributorsQuery.error as Error).message}
            onRetry={() => distributorsQuery.refetch()}
            retryLabel={t('ui.error.retry')}
          />
        )}

        {!distributorsQuery.isLoading
          && !distributorsQuery.error
          && sorted.length === 0 && (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title={t('home.empty.title')}
              description={t('home.empty.description')}
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

      {/* Tour guidé 3 étapes — déclenché au premier visit, persisté en
          localStorage. Self-rendering (gère son propre open state). */}
      <OnboardingSheet />
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
