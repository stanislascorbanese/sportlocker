'use client'

import { useEffect, useRef, useState } from 'react'

import type { Distributor } from '../../lib/api'
import { cn } from '../../lib/cn'

type LocatedDistributor = Distributor & { latitude: number; longitude: number }

/**
 * Barre de recherche unifiée région / département / commune au-dessus de
 * la carte. Tape sur `geo.api.gouv.fr` (gratuit, sans clé) en parallèle
 * sur les 3 endpoints et fusionne les résultats par type.
 *
 * Doc API :
 *  - https://geo.api.gouv.fr/decoupage-administratif/regions
 *  - https://geo.api.gouv.fr/decoupage-administratif/departements
 *  - https://geo.api.gouv.fr/decoupage-administratif/communes
 *
 * Au clic sur un résultat, on remonte le centre géographique + un niveau
 * de zoom adapté au type (région : 7, département : 9, commune : 12).
 * Le parent recentre la carte Leaflet via setView().
 */

type Kind = 'distributor' | 'region' | 'departement' | 'commune'

type GeoEntity = {
  nom: string
  code: string
  centre?: { type: 'Point'; coordinates: [number, number] } // [lng, lat]
}

type Result = {
  kind: Kind
  label: string
  code: string
  lat: number
  lng: number
  zoom: number
}

const ZOOM_BY_KIND: Record<Kind, number> = {
  distributor: 16,
  region:      7,
  departement: 9,
  commune:     12,
}

const KIND_LABEL: Record<Kind, string> = {
  distributor: 'Distributeur',
  region:      'Région',
  departement: 'Département',
  commune:     'Commune',
}

const KIND_COLOR: Record<Kind, string> = {
  distributor: 'bg-amber-500/20 text-amber-200',
  region:      'bg-violet-500/20 text-violet-200',
  departement: 'bg-sky-500/20 text-sky-200',
  commune:     'bg-emerald-500/20 text-emerald-200',
}

export type MapSearchTarget = {
  lat: number
  lng: number
  zoom: number
  label: string
}

export function MapSearch({
  distributors = [],
  onSelect,
}: {
  distributors?: LocatedDistributor[]
  onSelect: (t: MapSearchTarget) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        // Recherche locale dans les distributeurs (instantanée, hors réseau)
        const distributorMatches = searchDistributors(q, distributors)

        const enc = encodeURIComponent(q)
        const [regions, departements, communes] = await Promise.all([
          fetchEntities(`https://geo.api.gouv.fr/regions?nom=${enc}&fields=nom,code`, 'region'),
          fetchEntities(`https://geo.api.gouv.fr/departements?nom=${enc}&fields=nom,code`, 'departement'),
          fetchEntities(
            `https://geo.api.gouv.fr/communes?nom=${enc}&fields=nom,code,centre&boost=population&limit=5`,
            'commune',
          ),
        ])
        const enriched = await enrichCenters(regions.concat(departements))
        // Ordre : distributeurs > régions/dép > communes (du plus spécifique au moins)
        setResults([...distributorMatches, ...enriched, ...communes])
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    if (!open || results.length === 0) return
    const li = listRef.current?.querySelectorAll('li[data-result]')[activeIndex]
    li?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, results.length])

  function pick(r: Result) {
    onSelect({ lat: r.lat, lng: r.lng, zoom: r.zoom, label: r.label })
    setQuery(r.label)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[activeIndex]
      if (r) pick(r)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="🔎 Distributeur · région · département · commune (ex. SL-MAIRIE, Bretagne, 44, Nantes…)"
        className={cn(
          'w-full rounded-lg border border-white/15 bg-navy-800/80 px-4 py-2.5 text-sm text-white outline-none transition',
          'placeholder:text-white/40 focus:border-emerald-400/60',
        )}
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
      />
      {open && (results.length > 0 || loading) && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute inset-x-0 z-20 mt-1 max-h-80 overflow-auto rounded-lg border border-white/15 bg-navy-800 shadow-xl"
        >
          {loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-white/40">Recherche…</li>
          )}
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${r.code}`}
              data-result
              role="option"
              aria-selected={i === activeIndex}
            >
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(r)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-white/90 transition',
                  i === activeIndex ? 'bg-emerald-500/10' : 'hover:bg-emerald-500/5',
                )}
              >
                <span className="truncate">{r.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-white/40">{r.code}</span>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      KIND_COLOR[r.kind],
                    )}
                  >
                    {KIND_LABEL[r.kind]}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

async function fetchEntities(url: string, kind: Kind): Promise<Result[]> {
  const res = await fetch(url)
  if (!res.ok) return []
  const data = (await res.json()) as GeoEntity[]
  return data
    .filter((e) => e.centre || kind !== 'commune') // commune sans centre → invalide
    .map((e) => toResult(e, kind))
}

function toResult(e: GeoEntity, kind: Kind): Result {
  // centre.coordinates = [lng, lat]
  const coords = e.centre?.coordinates
  return {
    kind,
    label: e.nom,
    code: e.code,
    lat: coords?.[1] ?? 0,
    lng: coords?.[0] ?? 0,
    zoom: ZOOM_BY_KIND[kind],
  }
}

/**
 * Les endpoints `regions` et `departements` ne renvoient pas `centre` dans
 * la réponse standard, mais il est dispo via `geometry=centre`. On fait
 * un second appel groupé pour récupérer les coordonnées manquantes.
 */
async function enrichCenters(items: Result[]): Promise<Result[]> {
  const missing = items.filter((r) => r.lat === 0 && r.lng === 0)
  if (missing.length === 0) return items

  const byKind = new Map<Kind, Result[]>()
  for (const r of missing) {
    const arr = byKind.get(r.kind) ?? []
    arr.push(r)
    byKind.set(r.kind, arr)
  }

  await Promise.all(
    Array.from(byKind.entries()).map(async ([kind, list]) => {
      const codes = list.map((r) => r.code).join(',')
      const endpoint = kind === 'region' ? 'regions' : 'departements'
      const url = `https://geo.api.gouv.fr/${endpoint}?code=${codes}&fields=nom,code&geometry=centre&format=geojson`
      try {
        const res = await fetch(url)
        if (!res.ok) return
        const fc = (await res.json()) as {
          features?: Array<{
            properties: { code: string }
            geometry: { coordinates: [number, number] }
          }>
        }
        for (const f of fc.features ?? []) {
          const target = list.find((r) => r.code === f.properties.code)
          if (target) {
            target.lng = f.geometry.coordinates[0]
            target.lat = f.geometry.coordinates[1]
          }
        }
      } catch {
        // tant pis, le résultat aura lat/lng=0 et sera ignoré au pick
      }
    }),
  )
  return items.filter((r) => r.lat !== 0 || r.lng !== 0)
}

/**
 * Recherche locale dans les distributeurs — match sur `serialNumber` ou
 * `name` (insensible à la casse, fuzzy substring). Plafonné à 5 résultats
 * pour ne pas noyer la liste.
 */
function searchDistributors(q: string, distributors: LocatedDistributor[]): Result[] {
  const needle = q.toLowerCase()
  return distributors
    .filter(
      (d) =>
        d.serialNumber.toLowerCase().includes(needle) ||
        d.name.toLowerCase().includes(needle),
    )
    .slice(0, 5)
    .map((d) => ({
      kind: 'distributor' as const,
      label: d.name,
      code: d.serialNumber,
      lat: d.latitude,
      lng: d.longitude,
      zoom: ZOOM_BY_KIND.distributor,
    }))
}
