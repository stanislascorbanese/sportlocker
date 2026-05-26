'use client'

import { ChevronRight, MapPin, Package } from 'lucide-react'

import type { Distributor } from '../lib/api'
import { Badge } from './ui/Badge'

export type DistributorWithDistance = Distributor & { distanceKm: number | null }

/**
 * Ligne d'un distributeur dans la liste de la home. Cliquable, animation
 * scale-99 au tap, ChevronRight qui se déplace de 2px au hover.
 *
 * **Pas de fallback GPS** : si `addressLine` est null, on masque la ligne
 * d'adresse plutôt que d'afficher des coordonnées brutes (UX horrible et
 * pas exploitables par l'utilisateur). L'opérateur doit renseigner l'adresse
 * depuis le dashboard ; sinon le distributeur reste localisable sur la carte
 * via son marker.
 */
export function DistributorListItem({
  d,
  onPick,
}: {
  d: DistributorWithDistance
  onPick: (id: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(d.id)}
        className="group flex w-full items-center gap-3 rounded-card border border-white/10 bg-white/5 p-4 text-left transition-[border-color,background-color,transform] duration-base ease-out-soft hover:border-emerald-400/40 hover:bg-white/[0.07] active:scale-[0.99] focus-visible:outline-none focus-visible:border-emerald-400/60 focus-visible:ring-2 focus-visible:ring-emerald-400/30"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-white">{d.name}</p>
          {d.addressLine && (
            <p className="truncate text-meta text-white/55">{d.addressLine}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge
            tone="success"
            size="sm"
            icon={<Package className="h-3 w-3" aria-hidden="true" />}
          >
            {d.idleLockers}/{d.lockerCount}
          </Badge>
          {d.distanceKm != null && (
            <span className="inline-flex items-center gap-0.5 text-meta tabular-nums text-white/45">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {formatDistance(d.distanceKm)}
            </span>
          )}
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-white/30 transition-transform duration-base ease-out-soft group-hover:translate-x-0.5 group-hover:text-emerald-300/70"
          aria-hidden="true"
        />
      </button>
    </li>
  )
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}
