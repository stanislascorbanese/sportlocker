import type { StyleSpecification } from 'maplibre-gl'

/**
 * Style de la carte publique.
 *
 * Les couleurs sont reprises de `packages/config/tailwind/tokens.css` : la
 * carte doit suivre le theme clair/sombre comme le reste de l'app, sans
 * palette parallele a maintenir.
 *
 * Choix issus du rendu, pas de la theorie (voir claude/Tuiles_cartographiques) :
 *
 * 1. La mer tranche franchement sur la terre. Sur un littoral, c'est le repere
 *    d'orientation n°1 d'un vacancier qui cherche ou il est.
 * 2. Mer et eaux interieures sont DEUX couches. Le marais vendeen est un
 *    reseau de canaux tres fins : leur appliquer le trait de cote de la mer
 *    transforme la carte en maillage illisible.
 * 3. Deux niveaux de toponymes. Les hameaux n'apparaissent qu'a partir du
 *    zoom 12, en gris — sinon un mur de noms uniformes couvre tout.
 */

type Palette = {
  fond: string; batiment: string; voie: string; voieMajeure: string
  ink: string; inkMuted: string; vegetation: string
  mer: string; eauInterieure: string; traitDeCote: string; halo: string
}

const PALETTES: Record<'clair' | 'sombre', Palette> = {
  sombre: {
    fond: 'rgb(13,27,42)',          // --sl-bg
    batiment: 'rgb(27,46,64)',      // --sl-surface-2
    voie: 'rgb(38,57,76)',          // --sl-line
    voieMajeure: 'rgb(52,74,95)',
    ink: 'rgb(242,246,248)',        // --sl-ink
    inkMuted: 'rgb(147,166,180)',   // --sl-ink-muted
    vegetation: 'rgb(18,52,47)',    // --sl-brand-soft
    mer: 'rgb(28,62,92)',
    eauInterieure: 'rgb(19,44,66)',
    traitDeCote: 'rgb(52,96,132)',
    halo: 'rgb(13,27,42)',
  },
  clair: {
    fond: 'rgb(246,248,247)',
    batiment: 'rgb(238,242,240)',
    voie: 'rgb(221,228,225)',
    voieMajeure: 'rgb(255,255,255)',
    ink: 'rgb(15,26,22)',
    inkMuted: 'rgb(91,107,100)',
    vegetation: 'rgb(226,242,236)',
    mer: 'rgb(198,222,236)',
    eauInterieure: 'rgb(219,233,242)',
    traitDeCote: 'rgb(150,186,208)',
    halo: 'rgb(255,255,255)',
  },
}

/** Emprise des tuiles extraites : littoral Pays de la Loire + nord Charente-Maritime. */
export const EMPRISE_TUILES: [[number, number], [number, number]] =
  [[-2.65, 45.95], [-0.70, 47.35]]

export const CENTRE_DEFAUT: [number, number] = [-1.95, 46.72]

export function styleCarte(urlTuiles: string, theme: 'clair' | 'sombre'): StyleSpecification {
  const c = PALETTES[theme]
  return {
    version: 8,
    // TODO rapatrier les glyphes dans /public : dependance externe a chaque
    // chargement, ce qu'on voulait eviter en auto-hebergeant les tuiles.
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${urlTuiles}`,
        attribution: '© OpenStreetMap · Protomaps',
      },
    },
    layers: [
      { id: 'fond', type: 'background', paint: { 'background-color': c.fond } },
      { id: 'terre', type: 'fill', source: 'protomaps', 'source-layer': 'earth',
        paint: { 'fill-color': c.fond } },
      { id: 'vegetation', type: 'fill', source: 'protomaps', 'source-layer': 'landuse',
        filter: ['in', 'pmap:kind', 'park', 'forest', 'grass', 'wood', 'scrub', 'beach'],
        paint: { 'fill-color': c.vegetation, 'fill-opacity': 0.55 } },
      { id: 'eau-interieure', type: 'fill', source: 'protomaps', 'source-layer': 'water',
        filter: ['!in', 'pmap:kind', 'ocean', 'sea', 'lake'],
        paint: { 'fill-color': c.eauInterieure } },
      { id: 'mer', type: 'fill', source: 'protomaps', 'source-layer': 'water',
        filter: ['in', 'pmap:kind', 'ocean', 'sea', 'lake'],
        paint: { 'fill-color': c.mer } },
      { id: 'trait-de-cote', type: 'line', source: 'protomaps', 'source-layer': 'water',
        filter: ['in', 'pmap:kind', 'ocean', 'sea', 'lake'],
        paint: { 'line-color': c.traitDeCote,
                 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 1.6] } },
      { id: 'batiments', type: 'fill', source: 'protomaps', 'source-layer': 'buildings',
        minzoom: 13,
        paint: { 'fill-color': c.batiment, 'fill-opacity': 0.75 } },
      { id: 'voies', type: 'line', source: 'protomaps', 'source-layer': 'roads',
        filter: ['!in', 'pmap:kind', 'highway', 'major_road'],
        paint: { 'line-color': c.voie,
                 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.5, 16, 5] } },
      { id: 'voies-majeures', type: 'line', source: 'protomaps', 'source-layer': 'roads',
        filter: ['in', 'pmap:kind', 'highway', 'major_road'],
        paint: { 'line-color': c.voieMajeure,
                 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 6, 0.6, 16, 7] } },
      { id: 'toponymes-mineurs', type: 'symbol', source: 'protomaps', 'source-layer': 'places',
        filter: ['!in', 'pmap:kind', 'city', 'town'], minzoom: 12,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
                  'text-size': 11, 'text-padding': 8 },
        paint: { 'text-color': c.inkMuted, 'text-halo-color': c.halo, 'text-halo-width': 1.2 } },
      { id: 'toponymes-majeurs', type: 'symbol', source: 'protomaps', 'source-layer': 'places',
        filter: ['in', 'pmap:kind', 'city', 'town'],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
                  'text-size': ['interpolate', ['linear'], ['zoom'], 8, 12, 14, 17],
                  'text-padding': 12 },
        paint: { 'text-color': c.ink, 'text-halo-color': c.halo, 'text-halo-width': 1.6 } },
    ],
  }
}
