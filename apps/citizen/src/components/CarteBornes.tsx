'use client'

import 'maplibre-gl/dist/maplibre-gl.css'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { estPlacee, listerBornes, type BornePlacee } from '@/lib/bornes'
import { CENTRE_DEFAUT, EMPRISE_TUILES, styleCarte } from '@/lib/carte-style'
import { useLang } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

const URL_TUILES = process.env.NEXT_PUBLIC_TUILES_URL ?? ''

/**
 * Carte publique des bornes.
 *
 * MapLibre et pmtiles sont charges dynamiquement : ~1,3 Mo de JS qu'on ne fait
 * pas payer aux vacanciers qui arrivent par le QR code, c'est-a-dire la
 * majorite. Ils ne touchent jamais cette page.
 *
 * Les tuiles sont un fichier .pmtiles unique sur R2, lu par requetes HTTP
 * partielles (`Range`). Pas de serveur de tuiles, pas de cout a la requete.
 */
export function CarteBornes() {
  const conteneur = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { t } = useLang()
  const { theme } = useTheme()
  const [etat, setEtat] = useState<'chargement' | 'prete' | 'erreur'>('chargement')
  const [bornesDispo, setBornesDispo] = useState(true)
  const [cause, setCause] = useState<string | null>(null)

  useEffect(() => {
    if (!conteneur.current) return
    let carte: { remove: () => void } | null = null
    let delai: ReturnType<typeof setTimeout> | undefined
    let annule = false

    ;(async () => {
      // Le fond de plan et la liste des bornes sont deux echecs distincts :
      // une API injoignable ne doit pas effacer la carte. On les separe donc,
      // au lieu de les enfermer dans un try commun.
      let bornes: Awaited<ReturnType<typeof listerBornes>> = []
      let bornesOk = true
      try {
        bornes = await listerBornes()
      } catch {
        bornesOk = false
      }
      if (annule) return
      setBornesDispo(bornesOk)

      try {
        const [{ Map, Marker, NavigationControl, addProtocol }, { Protocol }] =
          await Promise.all([import('maplibre-gl'), import('pmtiles')])
        if (annule || !conteneur.current) return

        addProtocol('pmtiles', new Protocol().tile)

        const placees = bornes.filter(estPlacee)
        const m = new Map({
          container: conteneur.current,
          style: styleCarte(URL_TUILES, theme === 'dark' ? 'sombre' : 'clair'),
          center: CENTRE_DEFAUT,
          zoom: 10,
          // On borne la navigation a l'emprise des tuiles : hors de cette zone
          // il n'y a rien a afficher, et un ecran vide sans explication est
          // pire qu'une limite douce.
          minZoom: 8,
          maxZoom: 17,
          maxBounds: EMPRISE_TUILES,
          attributionControl: { compact: true },
        })
        carte = m
        m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')

        for (const b of placees) {
          const el = document.createElement('button')
          el.type = 'button'
          el.className = 'marqueur-borne'
          el.dataset.vide = b.idleLockers === 0 ? '1' : '0'
          el.textContent = String(b.idleLockers)
          el.setAttribute('aria-label', etiquette(b, t.carte.disponibles, t.carte.vide))
          el.addEventListener('click', () => {
            router.push(`/b/${encodeURIComponent(b.serialNumber)}` as Route)
          })
          new Marker({ element: el }).setLngLat([b.longitude, b.latitude]).addTo(m)
        }

        // Si des bornes existent, on cadre dessus plutot que sur un centre fixe.
        if (placees.length > 0) {
          const lons = placees.map((b) => b.longitude)
          const lats = placees.map((b) => b.latitude)
          m.fitBounds(
            [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
            { padding: 64, maxZoom: 14, animate: false },
          )
        }

        m.on('load', () => { if (!annule) setEtat('prete') })

        // Sans ca, une tuile qui ne se charge pas laisse un spinner infini :
        // `load` n'arrive jamais et le try/catch ci-dessus est deja passe.
        // Une erreur explicite vaut mieux qu'une attente sans fin.
        m.on('error', (e) => {
          const err = e.error ?? e
          console.error('[carte]', err)
          if (annule) return
          setCause(err instanceof Error ? err.message : String(err))
          setEtat('erreur')
        })

        // Filet de securite : si ni `load` ni `error` ne viennent (requete qui
        // pend, reseau qui ne repond pas), on cesse de faire patienter.
        delai = setTimeout(() => {
          if (annule) return
          // Dire OU ca bloque, pas seulement QUE ca bloque. Les trois etapes
          // peuvent echouer separement : le style (JSON + glyphes), la source
          // (l'archive .pmtiles), puis le rendu.
          const etapes = [
            `style=${m.isStyleLoaded() ? 'ok' : 'NON'}`,
            `source=${m.getSource('protomaps') ? 'declaree' : 'ABSENTE'}`,
            `tuiles=${m.areTilesLoaded() ? 'ok' : 'NON'}`,
            `taille=${m.getContainer().clientWidth}x${m.getContainer().clientHeight}`,
          ].join(' · ')
          console.error('[carte] blocage apres 20 s —', etapes)
          setEtat((v) => {
            if (v !== 'chargement') return v
            setCause(`blocage apres 20 s — ${etapes}`)
            return 'erreur'
          })
        }, 20_000)
      } catch (err) {
        console.error('[carte]', err)
        if (annule) return
        setCause(err instanceof Error ? err.message : String(err))
        setEtat('erreur')
      }
    })()

    return () => { annule = true; clearTimeout(delai); carte?.remove() }
  }, [router, theme, t])

  return (
    <div className="relative flex-1 overflow-hidden rounded-card">
      <div ref={conteneur} className="absolute inset-0" />
      {etat !== 'prete' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 px-6 text-center">
          <div>
            <p className="text-ink-muted">
              {etat === 'erreur' ? t.carte.erreur : t.carte.chargement}
            </p>
            {/* En developpement seulement : la cause reelle, sous les yeux,
                plutot qu'a chercher dans la console. */}
            {process.env.NODE_ENV !== 'production' && cause && (
              <p className="mt-3 max-w-md break-words font-mono text-meta text-danger">{cause}</p>
            )}
          </div>
        </div>
      )}
      {etat === 'prete' && !bornesDispo && (
        <p className="absolute inset-x-3 top-3 rounded-card bg-surface px-3 py-2 text-center text-meta text-ink-muted shadow">
          {t.carte.bornesIndispo}
        </p>
      )}
    </div>
  )
}

function etiquette(b: BornePlacee, dispo: string, vide: string): string {
  return b.idleLockers === 0
    ? `${b.name} — ${vide}`
    : `${b.name} — ${b.idleLockers} ${dispo}`
}
