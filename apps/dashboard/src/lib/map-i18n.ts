/**
 * Dictionnaire minimal pour les libellés liés à la cartographie Leaflet.
 *
 * Pas de dépendance i18n encore dans le dashboard : on lit simplement
 * `document.documentElement.lang` (positionné dans `app/layout.tsx`) et on
 * retourne le bon dictionnaire. Ajouter une nouvelle langue = ajouter une
 * entrée dans `STRINGS` + une option dans le sélecteur de langue (à venir).
 */

export type MapLang = 'fr' | 'en'

type DistributorStatus = 'online' | 'offline' | 'maintenance' | 'decommissioned'

export type MapStrings = {
  loading: string
  zoomIn: string
  zoomOut: string
  status: Record<DistributorStatus, string>
  freeLockers: (idle: number, total: number) => string
  editLink: string
  missingCoordsOne: string
  missingCoordsMany: (n: number) => string
  fillIn: string
  pickerHint: string
  pickerPlaceholder: string
}

export type MapTiles = {
  url: string
  subdomains: string
  maxZoom: number
  attribution: string
}

/**
 * Choix du serveur de tuiles selon la langue.
 *
 * Préférence : **Stadia Alidade Smooth Dark** — rendu dark mode façon
 * Apple Maps (eau bleue, parcs verts, routes lisibles). Requiert une clé
 * d'API gratuite (https://stadiamaps.com — 200 k req/mois gratuit), à
 * placer dans NEXT_PUBLIC_STADIA_API_KEY.
 *
 * Fallback : **CARTO Dark Matter** — sombre mais monochrome, gratuit sans
 * clé. Sert si la clé Stadia n'est pas configurée.
 *
 * Les deux variantes sont multilingues sur les toponymes locaux ; ni l'une
 * ni l'autre ne propose un mode tout-français.
 */
const STADIA_API_KEY = process.env.NEXT_PUBLIC_STADIA_API_KEY

const STADIA_DARK: MapTiles = {
  url: STADIA_API_KEY
    ? `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`
    : 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png',
  subdomains: 'a', // pas de {s} dans l'URL Stadia, Leaflet ignore le champ
  maxZoom: 20,
  attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

const CARTO_DARK: MapTiles = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  maxZoom: 20,
  attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

const DARK_TILES: MapTiles = STADIA_API_KEY ? STADIA_DARK : CARTO_DARK

const TILES: Record<MapLang, MapTiles> = {
  fr: DARK_TILES,
  en: DARK_TILES,
}

export function getMapTiles(lang: MapLang = detectMapLang()): MapTiles {
  return TILES[lang]
}

const STRINGS: Record<MapLang, MapStrings> = {
  fr: {
    loading: 'Chargement de la carte…',
    zoomIn: 'Zoomer',
    zoomOut: 'Dézoomer',
    status: {
      online: 'en ligne',
      offline: 'hors ligne',
      maintenance: 'maintenance',
      decommissioned: 'désactivé',
    },
    freeLockers: (idle, total) => `${idle} / ${total} libres`,
    editLink: 'Modifier →',
    missingCoordsOne: '1 distributeur sans coordonnées —',
    missingCoordsMany: (n) => `${n} distributeurs sans coordonnées —`,
    fillIn: 'renseigner',
    pickerHint: 'Cliquer ou glisser le marqueur pour positionner précisément',
    pickerPlaceholder: 'Renseigne une adresse ci-dessus ou clique sur la carte',
  },
  en: {
    loading: 'Loading map…',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    status: {
      online: 'online',
      offline: 'offline',
      maintenance: 'maintenance',
      decommissioned: 'decommissioned',
    },
    freeLockers: (idle, total) => `${idle} / ${total} free`,
    editLink: 'Edit →',
    missingCoordsOne: '1 distributor without coordinates —',
    missingCoordsMany: (n) => `${n} distributors without coordinates —`,
    fillIn: 'fill in',
    pickerHint: 'Click or drag the marker to position precisely',
    pickerPlaceholder: 'Enter an address above or click on the map',
  },
}

/**
 * Détecte la langue active depuis `<html lang>`. Si l'attribut n'existe pas
 * ou n'est pas supporté, on retombe sur le français (langue par défaut du
 * dashboard).
 */
export function detectMapLang(): MapLang {
  if (typeof document === 'undefined') return 'fr'
  const lang = document.documentElement.lang?.toLowerCase()
  if (lang?.startsWith('en')) return 'en'
  return 'fr'
}

export function getMapStrings(lang: MapLang = detectMapLang()): MapStrings {
  return STRINGS[lang]
}
