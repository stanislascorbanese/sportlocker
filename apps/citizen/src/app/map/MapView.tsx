'use client'

import maplibregl, { type LngLatLike, type Marker } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'

import type { Distributor } from '../../lib/api'

/**
 * Wrapper React autour de MapLibre GL JS.
 *
 * Tiles : OpenFreeMap (https://openfreemap.org), service gratuit basé sur
 * OSM, sans clé API, conçu pour la production. Style "liberty" = look clair
 * et lisible adapté pour superposer des markers contrastés.
 *
 * Markers : un pour la position user (point bleu), un par distributeur
 * (pin emerald). Cleanup propre au unmount pour éviter les fuites mémoire.
 */
export function MapView({
  center,
  distributors,
  onPick,
}: {
  center: { lat: number; lng: number }
  distributors: Distributor[]
  onPick: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Marker[]>([])

  // Init carte une seule fois.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lng, center.lat] as LngLatLike,
      zoom: 13,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    )
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render des markers à chaque changement de liste.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Cleanup des markers existants.
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    distributors.forEach((d) => {
      if (d.latitude == null || d.longitude == null) return
      const el = document.createElement('button')
      el.type = 'button'
      el.className =
        'flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-navy-900 text-xs font-bold shadow-lg ring-2 ring-emerald-200/40 transition hover:scale-110'
      el.textContent = String(d.idleLockers)
      el.setAttribute('aria-label', `${d.name} — ${d.idleLockers} casiers libres`)
      el.addEventListener('click', () => onPick(d.id))

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([d.longitude, d.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(
            `<div style="color:#0D1B2A;padding:4px 2px;">
              <div style="font-weight:600;font-size:13px;">${escapeHtml(d.name)}</div>
              <div style="font-size:11px;opacity:0.7;">${d.idleLockers}/${d.lockerCount} casiers libres</div>
            </div>`,
          ),
        )
        .addTo(map)
      markersRef.current.push(marker)
    })
  }, [distributors, onPick])

  // Recentrer la carte si le centre change (re-géoloc).
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.easeTo({ center: [center.lng, center.lat], duration: 800 })
  }, [center.lat, center.lng])

  return <div ref={containerRef} className="h-full w-full" />
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return map[c] ?? c
  })
}
