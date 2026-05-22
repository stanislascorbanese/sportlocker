'use client'

import { useQuery } from '@tanstack/react-query'
import { signOut } from 'firebase/auth'
import { ChevronRight, History, LogOut, MapPin, Package, QrCode, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useRequireAuth } from '../lib/auth-context'
import {
  fetchActiveReservation,
  fetchAllDistributors,
  type Distributor,
  type ReservationActive,
} from '../lib/api'
import { getFirebaseAuth } from '../lib/firebase'
import { MapView } from './map/MapView'

/**
 * Écran d'accueil — carte interactive avec TOUS les distributeurs du parc.
 *
 * Comportement :
 *   1. Géoloc browser → centre la carte sur l'utilisateur (zoom 13).
 *      Fallback Paris si refusé / indispo.
 *   2. Fetch /v1/distributors (liste complète, pas de filtre rayon).
 *   3. Distance Haversine calculée client-side pour le tri du bottom-sheet.
 *   4. Clic marker / carte → /distributors/:id
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
    // Évite le flash "rien" pendant un refetch : on garde la précédente
    // valeur jusqu'à la résolution.
    placeholderData: (prev) => prev,
  })

  // Tri par distance client-side une fois la géoloc dispo. Sans coords on
  // garde l'ordre serveur (ordre d'insertion).
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
        <p className="text-white/40 text-sm">Chargement…</p>
      </main>
    )
  }

  const displayName = user.displayName || user.email || user.phoneNumber || 'sportif'

  return (
    <main className="flex min-h-screen flex-col bg-navy-900">
      <header className="flex items-center justify-between gap-3 bg-navy-900 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)]">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-emerald-300/70">
            Bonjour {displayName.split(' ')[0]}
          </p>
          <h1 className="font-display text-lg font-semibold leading-tight">
            Distributeurs disponibles
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href="/history"
            aria-label="Historique"
            className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
          >
            <History className="h-4 w-4" />
          </Link>
          <Link
            href="/profile"
            aria-label="Profil"
            className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
          >
            <User className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => signOut(getFirebaseAuth())}
            aria-label="Se déconnecter"
            className="rounded-full bg-white/10 p-2 transition hover:bg-white/20"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {activeReservationQuery.data && (
        <ActiveReservationBanner
          r={activeReservationQuery.data}
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

      <section className="rounded-t-3xl border-t border-white/10 bg-navy-800 px-5 py-5 pb-[calc(var(--safe-bottom)+1.5rem)]">
        {geoError && (
          <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
            ⚠️ {geoError}. On affiche Paris par défaut.
          </p>
        )}
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-white/55">
          {sorted.length} distributeur{sorted.length > 1 ? 's' : ''}
        </h2>
        {distributorsQuery.isLoading && <p className="text-sm text-white/50">Chargement…</p>}
        {distributorsQuery.error && (
          <p className="text-sm text-rose-300">
            Erreur : {(distributorsQuery.error as Error).message}
          </p>
        )}
        {!distributorsQuery.isLoading && sorted.length === 0 && (
          <p className="text-sm text-white/50">Aucun distributeur déployé pour le moment.</p>
        )}
        <ul className="space-y-2">
          {sorted.map((d) => (
            <DistributorRow
              key={d.id}
              d={d}
              onClick={() => router.push(`/distributors/${d.id}`)}
            />
          ))}
        </ul>
      </section>
    </main>
  )
}

/**
 * Bannière épinglée au-dessus de la carte quand l'utilisateur a une
 * réservation vivante (scheduled/pending/active). Surface le créneau et un
 * bouton "Voir mon QR" pour retrouver le QR depuis n'importe où dans l'app
 * (fixed UX gap : avant cette refonte, quitter l'écran de confirmation
 * perdait l'accès au QR).
 */
function ActiveReservationBanner({
  r,
  onClick,
}: {
  r: ReservationActive
  onClick: () => void
}) {
  const statusLabel = STATUS_LABELS[r.status] ?? r.status
  const isScheduled = r.status === 'scheduled'
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-5 mb-3 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 px-4 py-3 text-left transition hover:border-emerald-400/70"
      aria-label="Voir mon QR code de réservation"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
        <QrCode className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-emerald-300/80">
          Réservation {statusLabel}
        </p>
        <p className="truncate text-sm font-medium">
          {r.item.typeName} · {r.distributor.name}
        </p>
        <p className="text-[11px] text-white/55">
          {isScheduled
            ? `Présente ton QR à ${fmtSlotStart(r)}`
            : `QR valide jusqu'à ${fmtTime(r.expiresAt)}`}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-emerald-300/70" />
    </button>
  )
}

const STATUS_LABELS: Record<ReservationActive['status'], string> = {
  scheduled: 'à venir',
  pending: 'à scanner',
  active: 'en cours',
  returned: 'rendue',
  overdue: 'en retard',
  cancelled: 'annulée',
  expired: 'expirée',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtSlotStart(r: ReservationActive): string {
  // Pour les résas scheduled, expiresAt = slotEndAt + grâce (15 min après
  // le créneau). On ne sait pas slotStartAt exact côté front. Faute de
  // mieux, on affiche l'expiration comme "fenêtre fin".
  return fmtTime(r.expiresAt)
}

type DistributorWithDistance = Distributor & { distanceKm: number | null }

function DistributorRow({ d, onClick }: { d: DistributorWithDistance; onClick: () => void }) {
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
            {d.addressLine ?? `${d.latitude?.toFixed(4) ?? '—'}, ${d.longitude?.toFixed(4) ?? '—'}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
            <Package className="h-3 w-3" />
            {d.idleLockers}/{d.lockerCount}
          </span>
          {d.distanceKm != null && (
            <span className="text-[10px] text-white/50">
              <MapPin className="mr-0.5 inline h-3 w-3" />
              {formatDistance(d.distanceKm)}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
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
