'use client'

import { LocateFixed } from 'lucide-react'
import Link from 'next/link'
import Script from 'next/script'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Distributor } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useLang } from '../../lib/lang-client'
import { getMapStrings, getMapTiles, TILES_NEED_DIMMING } from '../../lib/map-i18n'
import type { LeafletMap } from '../../lib/leaflet-types'
import { MapSearch, type MapSearchTarget } from './MapSearch'

const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

type Status = Distributor['status']
const ALL_STATUSES: Status[] = ['online', 'maintenance', 'offline', 'decommissioned']

const STATUS_COLOR: Record<Status, string> = {
  online:         '#34d399',
  offline:        '#fb7185',
  maintenance:    '#fbbf24',
  decommissioned: '#a1a1aa',
}

export function MapClient({ distributors }: { distributors: Distributor[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const [leafletReady, setLeafletReady] = useState(false)
  const [viewTarget, setViewTarget] = useState<MapSearchTarget | null>(null)
  const [visibleStatuses, setVisibleStatuses] = useState<Set<Status>>(() => new Set(ALL_STATUSES))
  const lang = useLang()
  const strings = useMemo(() => getMapStrings(lang), [lang])
  const tiles = useMemo(() => getMapTiles(lang), [lang])

  const allGeo = useMemo(
    () =>
      distributors.filter(
        (d): d is Distributor & { latitude: number; longitude: number } =>
          d.latitude !== null && d.longitude !== null,
      ),
    [distributors],
  )

  const visibleGeo = useMemo(
    () => allGeo.filter((d) => visibleStatuses.has(d.status)),
    [allGeo, visibleStatuses],
  )

  const fitAll = useCallback(() => {
    const map = mapRef.current
    const L = window.L
    if (!map || !L) return
    if (visibleGeo.length === 0) {
      map.setView([46.7, 2.5], 6)
      return
    }
    const points: Array<[number, number]> = visibleGeo.map((d) => [d.latitude, d.longitude])
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
  }, [visibleGeo])

  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return
    const L = window.L
    if (!L) return

    const points: Array<[number, number]> = visibleGeo.map((d) => [d.latitude, d.longitude])

    const map = L.map(containerRef.current, { zoomControl: false })
    mapRef.current = map

    new L.Control.Zoom({ zoomInTitle: strings.zoomIn, zoomOutTitle: strings.zoomOut }).addTo(map)

    L.tileLayer(tiles.url, {
      attribution: tiles.attribution,
      subdomains: tiles.subdomains,
      maxZoom: tiles.maxZoom,
    }).addTo(map)

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] })
    } else {
      map.setView([46.7, 2.5], 6)
    }

    for (const d of visibleGeo) {
      const color = STATUS_COLOR[d.status]
      const popup = `
        <div style="font-family: system-ui; min-width: 180px">
          <div style="font-weight: 600; margin-bottom: 4px">${escapeHtml(d.name)}</div>
          <div style="font-size: 11px; color: #6b7280; font-family: ui-monospace, monospace">${escapeHtml(d.serialNumber)}</div>
          <div style="margin-top: 6px; font-size: 13px">
            <span style="color:${color}; font-weight: 600">${escapeHtml(strings.status[d.status])}</span>
            · ${escapeHtml(strings.freeLockers(d.idleLockers, d.lockerCount))}
          </div>
          <a href="/distributors/${d.id}/edit" style="display:inline-block;margin-top:8px;font-size:12px;color:#1d9e75;text-decoration:underline">${escapeHtml(strings.editLink)}</a>
        </div>
      `.trim()

      L.circleMarker([d.latitude, d.longitude], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(popup)
    }

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [leafletReady, visibleGeo, strings, tiles])

  // Recentrage déclenché par la barre de recherche.
  useEffect(() => {
    if (!viewTarget || !mapRef.current) return
    mapRef.current.setView([viewTarget.lat, viewTarget.lng], viewTarget.zoom)
  }, [viewTarget])

  function toggleStatus(s: Status) {
    setVisibleStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(s)) {
        // Empêche de tout désactiver — au moins un statut reste visible.
        if (next.size > 1) next.delete(s)
      } else {
        next.add(s)
      }
      return next
    })
  }

  const missingCoords = distributors.length - allGeo.length

  return (
    <>
      <link rel="stylesheet" href={LEAFLET_CSS_URL} />
      <Script
        src={LEAFLET_JS_URL}
        strategy="afterInteractive"
        onLoad={() => setLeafletReady(true)}
      />

      <div className="mb-4 space-y-3">
        <MapSearch distributors={allGeo} onSelect={setViewTarget} />
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
          {ALL_STATUSES.map((s) => (
            <LegendToggle
              key={s}
              color={STATUS_COLOR[s]}
              label={strings.status[s]}
              active={visibleStatuses.has(s)}
              count={allGeo.filter((d) => d.status === s).length}
              onClick={() => toggleStatus(s)}
            />
          ))}
          <button
            type="button"
            onClick={fitAll}
            disabled={visibleGeo.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/70 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-40"
            title="Recentrer la carte sur tous les distributeurs visibles"
          >
            <LocateFixed className="h-3 w-3" />
            Tout afficher
          </button>
          {missingCoords > 0 && (
            <span className="basis-full text-amber-300/80">
              {missingCoords === 1 ? strings.missingCoordsOne : strings.missingCoordsMany(missingCoords)}{' '}
              <Link href="/distributors" className="underline">{strings.fillIn}</Link>
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn(
          'h-[70vh] w-full overflow-hidden rounded-xl border border-white/10 bg-navy-800',
          TILES_NEED_DIMMING && 'map-tiles-dimmed',
        )}
        aria-label="Carte des distributeurs"
      >
        {!leafletReady && (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            {strings.loading}
          </div>
        )}
      </div>
    </>
  )
}

function LegendToggle({
  color,
  label,
  active,
  count,
  onClick,
}: {
  color: string
  label: string
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition',
        active
          ? 'border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.08]'
          : 'border-white/5 bg-transparent text-white/30 hover:text-white/50',
      )}
      title={active ? `Masquer "${label}"` : `Afficher "${label}"`}
    >
      <span
        className={cn('inline-block h-2.5 w-2.5 rounded-full transition', !active && 'opacity-40')}
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
      <span className="text-[10px] text-white/40">{count}</span>
    </button>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
