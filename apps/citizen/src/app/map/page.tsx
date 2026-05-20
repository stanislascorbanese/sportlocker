'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Package } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useRequireAuth } from '../../lib/auth-context'
import { fetchNearbyDistributors, type NearbyDistributor } from '../../lib/api'
import { MapView } from './MapView'

/**
 * Page carte — affiche les distributeurs autour de l'utilisateur.
 *
 * Flow :
 *   1. Demande la géoloc browser (Geolocation API). Fallback Paris si refus.
 *   2. Fetch /v1/distributors/nearby?lat=&lng=&radius_km=5
 *   3. Rend la map MapLibre + un panneau bottom-sheet listant les
 *      distributeurs triés par distance.
 *   4. Clic sur un marker ou une carte → /distributors/:id
 */
export default function MapPage() {
  const user = useRequireAuth()
  const router = useRouter()
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Géolocalisation indisponible sur cet appareil.')
      setCoords({ lat: 48.8566, lng: 2.3522 }) // fallback Paris
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setGeoError(err.message)
        setCoords({ lat: 48.8566, lng: 2.3522 }) // fallback Paris
      },
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 30_000 },
    )
  }, [])

  const distributorsQuery = useQuery({
    queryKey: ['distributors-nearby', coords?.lat, coords?.lng],
    queryFn: () => fetchNearbyDistributors(coords!.lat, coords!.lng, 10),
    enabled: Boolean(coords && user),
  })

  if (!user) return null

  return (
    <main className="relative min-h-screen">
      <header className="absolute left-0 right-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-navy-900/95 to-transparent px-4 pb-6 pt-[calc(var(--safe-top)+0.75rem)]">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 backdrop-blur hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="font-display text-lg font-semibold">Distributeurs autour</h1>
          <p className="text-[11px] text-white/60">
            {coords ? `Rayon 10 km` : 'Localisation…'}
          </p>
        </div>
      </header>

      <div className="h-[60vh]">
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

      <section className="rounded-t-3xl border-t border-white/10 bg-navy-800 px-5 py-5 pb-[calc(var(--safe-bottom)+1.5rem)]">
        {geoError && (
          <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            ⚠️ {geoError}. On affiche Paris par défaut.
          </p>
        )}
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/55">
          {distributorsQuery.data?.length ?? 0} distributeur(s) à proximité
        </h2>
        {distributorsQuery.isLoading && <p className="text-sm text-white/50">Chargement…</p>}
        {distributorsQuery.error && (
          <p className="text-sm text-rose-300">Erreur : {(distributorsQuery.error as Error).message}</p>
        )}
        <ul className="space-y-2">
          {distributorsQuery.data?.map((d) => (
            <DistributorRow key={d.id} d={d} onClick={() => router.push(`/distributors/${d.id}`)} />
          ))}
        </ul>
      </section>
    </main>
  )
}

function DistributorRow({ d, onClick }: { d: NearbyDistributor; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-emerald-400/40"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{d.name}</p>
          <p className="truncate text-[11px] text-white/50">
            {d.addressLine ?? `${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
            <Package className="h-3 w-3" />
            {d.idleLockers}/{d.lockerCount}
          </span>
          <span className="text-[10px] text-white/50">
            <MapPin className="mr-0.5 inline h-3 w-3" />
            {d.distanceKm.toFixed(1)} km
          </span>
        </div>
      </button>
    </li>
  )
}
