import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Icon Leaflet par défaut casse sous bundlers (resolve via PNG) — on en pose
// un custom SVG inline aux couleurs brand pour garder le contrôle visuel.
const brandIcon = L.divIcon({
  className: '',
  html: `<div style="
    width:32px;height:32px;border-radius:50% 50% 50% 0;
    background:#0150F6;transform:rotate(-45deg);
    border:3px solid #fff;box-shadow:0 4px 12px rgba(1,80,246,0.5);
    display:flex;align-items:center;justify-content:center;
  "><span style="transform:rotate(45deg);color:#fff;font-weight:700;font-size:14px">📍</span></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
})

interface Selection {
  lat: number
  lng: number
  commune: string | null
  loading: boolean
}

// France métropolitaine — bbox utilisée pour borner l'usager dans la zone
// éligible et éviter qu'il ne perde la carte en allant en Atlantique.
const FRANCE_BOUNDS: L.LatLngBoundsLiteral = [
  [41.0, -5.5], // SW (sud Corse, Atlantique ouest)
  [51.5, 9.8],  // NE (nord Belgique, Rhin)
]

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // Nominatim OSM — gratuit, conforme à leur usage policy (1 req/s max,
  // user-agent identifiable, pas d'appel automatique en masse).
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'fr' } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { address?: Record<string, string> }
    const a = data.address ?? {}
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null
  } catch {
    return null
  }
}

export default function CoverageMap(): JSX.Element {
  const mapEl = useRef<HTMLDivElement | null>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    if (!mapEl.current || mapInstance.current) return

    const map = L.map(mapEl.current, {
      center: [46.6, 2.5],
      zoom: 6,
      minZoom: 5,
      maxBounds: FRANCE_BOUNDS,
      maxBoundsViscosity: 0.8,
      zoomControl: true,
      attributionControl: true,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(map)

    // Overlay teinté brand pour suggérer « zone desservie »
    L.rectangle(FRANCE_BOUNDS, {
      color: '#0150F6',
      weight: 0,
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(map)

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (markerRef.current) markerRef.current.remove()
      const marker = L.marker([lat, lng], { icon: brandIcon }).addTo(map)
      markerRef.current = marker
      setSelection({ lat, lng, commune: null, loading: true })

      const commune = await reverseGeocode(lat, lng)
      setSelection({ lat, lng, commune, loading: false })
    })

    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  const contactHref = selection
    ? `/contact?type=mairie&locality=${encodeURIComponent(
        selection.commune ?? `lat=${selection.lat.toFixed(3)},lng=${selection.lng.toFixed(3)}`,
      )}`
    : '/contact?type=mairie'

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-stretch">
      <div
        ref={mapEl}
        className="card-dark p-0 overflow-hidden h-[480px] sm:h-[560px] rounded-2xl"
        aria-label="Carte interactive de la France — cliquez sur votre commune"
      />

      <div className="card-dark p-7 sm:p-8 flex flex-col">
        <span className="tag tag-brand inline-block self-start mb-5">Couverture</span>
        {/* h2 (et non h3) : ce titre apparaît dans le flux après le <h1> de la
            page mais avant le premier <h2> des sections suivantes — un h3 ici
            casserait l'ordre séquentiel des titres (audit a11y heading-order). */}
        <h2 className="font-extrabold text-2xl text-white mb-4 leading-tight">
          France métropolitaine<br />entièrement éligible.
        </h2>
        <p className="text-sm text-white/65 font-light leading-relaxed mb-6">
          Aucune zone exclue : nous déployons partout en métropole, du littoral atlantique
          aux communes alpines. Installation pilote sous 4-6 semaines à compter du devis signé.
        </p>

        {selection ? (
          <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-5 mb-5">
            <div className="text-[0.65rem] uppercase tracking-[0.12em] text-brand-400 mb-1.5">
              Commune sélectionnée
            </div>
            {selection.loading ? (
              <div className="font-extrabold text-lg text-white/60 animate-pulse">
                Identification en cours…
              </div>
            ) : (
              <>
                <div className="font-extrabold text-xl text-white">
                  {selection.commune ?? 'Emplacement personnalisé'}
                </div>
                <div className="text-[0.7rem] text-white/60 font-light mt-1 tabular-nums">
                  {selection.lat.toFixed(3)}° N, {selection.lng.toFixed(3)}° E
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-5 mb-5">
            <div className="text-sm text-white/70 font-light">
              👆 Cliquez sur la carte pour indiquer votre commune et recevoir un devis ciblé.
            </div>
          </div>
        )}

        <ul className="space-y-2.5 text-[0.78rem] text-white/55 mb-6 font-light leading-relaxed">
          <li className="flex gap-2.5"><span className="text-brand-400 shrink-0">✓</span>Visite de site offerte en Loire-Atlantique &amp; Vendée</li>
          <li className="flex gap-2.5"><span className="text-brand-400 shrink-0">✓</span>Frais de transport inclus jusqu'à 300 km</li>
          <li className="flex gap-2.5"><span className="text-brand-400 shrink-0">✓</span>Au-delà : devis sur mesure (rare en pratique)</li>
        </ul>

        <div className="flex-1" />

        <a href={contactHref} className="btn btn-primary w-full">
          {selection?.commune
            ? `Étudier le déploiement à ${selection.commune} →`
            : 'Demander une étude de site →'}
        </a>
      </div>
    </div>
  )
}
