'use client'

import Link from 'next/link'
import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

import type { Distributor } from '../../lib/api'
import { getMapStrings, getMapTiles, type MapStrings, type MapTiles } from '../../lib/map-i18n'
import type { LeafletMap } from '../../lib/leaflet-types'

const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

const STATUS_COLOR: Record<Distributor['status'], string> = {
  online:         '#34d399',
  offline:        '#fb7185',
  maintenance:    '#fbbf24',
  decommissioned: '#a1a1aa',
}

export function MapClient({ distributors }: { distributors: Distributor[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const [leafletReady, setLeafletReady] = useState(false)
  const [strings, setStrings] = useState<MapStrings>(() => getMapStrings('fr'))
  const [tiles, setTiles] = useState<MapTiles>(() => getMapTiles('fr'))

  // Détecte la langue côté client (document.documentElement.lang)
  useEffect(() => {
    setStrings(getMapStrings())
    setTiles(getMapTiles())
  }, [])

  const geo = distributors.filter(
    (d): d is Distributor & { latitude: number; longitude: number } =>
      d.latitude !== null && d.longitude !== null,
  )

  useEffect(() => {
    if (!leafletReady || !containerRef.current || mapRef.current) return
    const L = window.L
    if (!L) return

    const points: Array<[number, number]> = geo.map((d) => [d.latitude, d.longitude])

    const map = L.map(containerRef.current, { zoomControl: false })
    mapRef.current = map

    // Contrôles zoom avec libellés localisés
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

    for (const d of geo) {
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
  }, [leafletReady, geo, strings, tiles])

  const missingCoords = distributors.length - geo.length

  return (
    <>
      <link rel="stylesheet" href={LEAFLET_CSS_URL} />
      <Script
        src={LEAFLET_JS_URL}
        strategy="afterInteractive"
        onLoad={() => setLeafletReady(true)}
      />

      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-white/60">
        <Legend color={STATUS_COLOR.online} label={strings.status.online} />
        <Legend color={STATUS_COLOR.maintenance} label={strings.status.maintenance} />
        <Legend color={STATUS_COLOR.offline} label={strings.status.offline} />
        <Legend color={STATUS_COLOR.decommissioned} label={strings.status.decommissioned} />
        {missingCoords > 0 && (
          <span className="text-amber-300/80">
            {missingCoords === 1 ? strings.missingCoordsOne : strings.missingCoordsMany(missingCoords)}{' '}
            <Link href="/distributors" className="underline">{strings.fillIn}</Link>
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-hidden rounded-xl border border-white/10 bg-navy-800"
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
