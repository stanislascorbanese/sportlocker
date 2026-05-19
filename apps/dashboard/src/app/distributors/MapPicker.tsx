'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

import { getMapStrings, getMapTiles } from '../../lib/map-i18n'
import type { LeafletMap, LeafletMarker } from '../../lib/leaflet-types'

const LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

const DEFAULT_CENTER: [number, number] = [46.7, 2.5] // Centre France
const DEFAULT_ZOOM = 5
const PICKED_ZOOM = 16

/**
 * Mini-carte interactive pour positionner un distributeur :
 * - clic sur la carte → met à jour lat/lng
 * - marqueur draggable → idem
 * - réagit aux changements externes de lat/lng (autocomplétion d'adresse)
 *
 * Stratégie de re-render : la carte Leaflet est créée une seule fois (effet
 * vide). On utilise des refs pour les valeurs courantes afin d'éviter de
 * recréer la carte à chaque saisie, mais on garde le marqueur sync via un
 * second effet qui ne recentre que sur changement externe (lat/lng prop).
 */
export function MapPicker({
  latitude,
  longitude,
  onChange,
}: {
  latitude: string
  longitude: string
  onChange: (lat: number, lng: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<LeafletMarker | null>(null)
  const onChangeRef = useRef(onChange)
  const [ready, setReady] = useState(false)
  const [strings] = useState(() => getMapStrings())
  const [tiles] = useState(() => getMapTiles())

  // Garde onChange à jour sans recréer la carte
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Création unique de la carte
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return
    const L = window.L
    if (!L) return

    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    const hasInitial = Number.isFinite(lat) && Number.isFinite(lng)

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    })
    map.setView(hasInitial ? [lat, lng] : DEFAULT_CENTER, hasInitial ? PICKED_ZOOM : DEFAULT_ZOOM)
    mapRef.current = map

    L.tileLayer(tiles.url, {
      attribution: tiles.attribution,
      subdomains: tiles.subdomains,
      maxZoom: tiles.maxZoom,
    }).addTo(map)

    if (hasInitial) {
      markerRef.current = L.marker([lat, lng], { draggable: true })
        .addTo(map)
        .on('dragend', (e) => {
          const p = e.target.getLatLng()
          onChangeRef.current(p.lat, p.lng)
        })
    }

    map.on('click', (e) => {
      const { lat: clat, lng: clng } = e.latlng
      if (markerRef.current) {
        markerRef.current.setLatLng([clat, clng])
      } else {
        markerRef.current = L.marker([clat, clng], { draggable: true })
          .addTo(map)
          .on('dragend', (ev) => {
            const p = ev.target.getLatLng()
            onChangeRef.current(p.lat, p.lng)
          })
      }
      onChangeRef.current(clat, clng)
    })

    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Sync marqueur quand lat/lng changent depuis l'extérieur (ex : adresse autocomplétée)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const L = window.L
    if (!L) return
    const lat = parseFloat(latitude)
    const lng = parseFloat(longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    if (markerRef.current) {
      const current = markerRef.current.getLatLng()
      if (current.lat === lat && current.lng === lng) return
      markerRef.current.setLatLng([lat, lng])
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true })
        .addTo(map)
        .on('dragend', (e) => {
          const p = e.target.getLatLng()
          onChangeRef.current(p.lat, p.lng)
        })
    }
    map.setView([lat, lng], PICKED_ZOOM)
  }, [latitude, longitude])

  const hasCoords = Number.isFinite(parseFloat(latitude)) && Number.isFinite(parseFloat(longitude))

  return (
    <div className="space-y-1.5">
      <link rel="stylesheet" href={LEAFLET_CSS_URL} />
      <Script
        src={LEAFLET_JS_URL}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-lg border border-white/10 bg-navy-800"
        aria-label="Carte de positionnement"
      >
        {!ready && (
          <div className="flex h-full items-center justify-center text-sm text-white/50">
            {strings.loading}
          </div>
        )}
      </div>
      <p className="text-[11px] text-white/40">
        {hasCoords ? strings.pickerHint : strings.pickerPlaceholder}
      </p>
    </div>
  )
}
