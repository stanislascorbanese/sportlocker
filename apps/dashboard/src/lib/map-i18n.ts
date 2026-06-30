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
  // Page header
  pageTitle: string
  subtitle1: string
  subtitleMany: string
  apiUnreachable: string
  // MapClient
  fitAll: string
  fitAllTitle: string
  ariaMapLabel: string
  legendShow: string
  legendHide: string
  // MapSearch
  searchPlaceholder: string
  searchLoading: string
  kindDistributor: string
  kindRegion: string
  kindDepartement: string
  kindCommune: string
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
 * Objectif : couleurs naturelles (eau bleue, parcs verts) pour une bonne
 * lisibilité. L'atténuation pour s'harmoniser avec le thème dark du
 * dashboard est faite côté CSS (filter brightness/contrast appliqué à la
 * couche tuiles seule), pas via des tuiles dark monochromes qui perdent
 * l'information chromatique.
 *
 * - fr → OSM France (toponymes locaux : "Bretagne", "Grand Est"…)
 * - en → CARTO Voyager (toponymes anglicisés)
 *
 * Option premium : Stadia Alidade Smooth Dark si NEXT_PUBLIC_STADIA_API_KEY
 * est défini au build. Override sur les deux langues.
 */
const STADIA_API_KEY = process.env.NEXT_PUBLIC_STADIA_API_KEY

const STADIA_DARK: MapTiles | null = STADIA_API_KEY
  ? {
      url: `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${STADIA_API_KEY}`,
      subdomains: 'a',
      maxZoom: 20,
      attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }
  : null

const OSM_FR: MapTiles = {
  url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  subdomains: 'abc',
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

const CARTO_VOYAGER: MapTiles = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  maxZoom: 20,
  attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}

const TILES: Record<MapLang, MapTiles> = {
  fr: STADIA_DARK ?? OSM_FR,
  en: STADIA_DARK ?? CARTO_VOYAGER,
}

/**
 * Vrai si on utilise un fond clair (OSM/Voyager) — dans ce cas, le composant
 * carte applique la classe `.map-tiles-dimmed` pour atténuer la luminosité
 * (cf. globals.css). Faux si Stadia est actif (déjà dark, pas besoin).
 */
export const TILES_NEED_DIMMING = STADIA_DARK === null

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
    pageTitle: 'Carte du parc',
    subtitle1: 'distributeur référencé — cliquer un marqueur pour les détails.',
    subtitleMany: 'distributeurs référencés — cliquer un marqueur pour les détails.',
    apiUnreachable: 'API injoignable',
    fitAll: 'Tout afficher',
    fitAllTitle: 'Recentrer la carte sur tous les distributeurs visibles',
    ariaMapLabel: 'Carte des distributeurs',
    legendShow: 'Afficher',
    legendHide: 'Masquer',
    searchPlaceholder: '🔎 Distributeur · région · département · commune (ex. SL-MAIRIE, Bretagne, 44, Nantes…)',
    searchLoading: 'Recherche…',
    kindDistributor: 'Distributeur',
    kindRegion:      'Région',
    kindDepartement: 'Département',
    kindCommune:     'Commune',
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
    pageTitle: 'Fleet map',
    subtitle1: 'distributor referenced — click a marker for details.',
    subtitleMany: 'distributors referenced — click a marker for details.',
    apiUnreachable: 'API unreachable',
    fitAll: 'Fit all',
    fitAllTitle: 'Recenter the map on all visible distributors',
    ariaMapLabel: 'Distributors map',
    legendShow: 'Show',
    legendHide: 'Hide',
    searchPlaceholder: '🔎 Distributor · region · department · commune (e.g. SL-MAIRIE, Brittany, 44, Nantes…)',
    searchLoading: 'Searching…',
    kindDistributor: 'Distributor',
    kindRegion:      'Region',
    kindDepartement: 'Department',
    kindCommune:     'Commune',
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
