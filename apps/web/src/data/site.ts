// Source unique de vérité de la vitrine.
//
// Version 3 — septembre 2026. Le site s'adresse à une seule personne : le
// gérant d'un camping de la côte atlantique, entre novembre et février, qui
// arbitre un budget d'équipement pour la saison suivante.
//
// Ce qu'il vient chercher, dans cet ordre observé chez les fournisseurs
// installés du secteur (Proludic, Rapidhome, Air et Volume, Le Casier
// Connecté, eSeason) : est-ce que ça rentre chez moi, combien ça coûte, qui
// répare quand ça casse, et qu'est-ce que je risque.
//
// Ce qui a disparu ici : MARKETPLACE, SLOT_DURATIONS, PRICING_TEMPLATES,
// DEPOSITS, subsidyRate(), LOCATIONS_PER_DIST_PER_DAY. SportLocker n'encaisse
// plus rien du vacancier, ne vend plus aux communes, et n'invente plus de
// chiffre d'usage tant qu'aucune borne n'a fait une saison.

import produit from './produit.json'

/**
 * Les faits produit — offres, spécifications, dotation, engagements — vivent
 * dans `produit.json`, lu à la fois par ce fichier et par
 * `scripts/fiche-technique.py`. Le site et le PDF remis en rendez-vous ne
 * peuvent donc pas diverger : c'est exactement la dérive qui avait produit
 * trois modèles économiques contradictoires en mai 2026.
 */

export const SITE = {
  name: 'SportLocker',
  legalName: 'SportLocker',
  url: 'https://sportlocker.fr',
  email: 'stanislas.corbanese@gmail.com',
  description:
    'Le matériel de sport de votre camping, en libre-service 24 h/24, sans mobiliser votre accueil.',
  defaultOgImage: '/og-default.png',
  twitterHandle: '@sportlocker',
} as const

export const NAV = [
  { href: '/la-borne', label: 'La borne' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/installation-sav', label: 'Installation & SAV' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/contact', label: 'Contact' },
] as const

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

export interface Offre {
  slug: string
  label: string
  pitch: string
  /** Ligne de prix principale, déjà formatée. */
  prix: string
  prixDetail: string
  /** Deuxième ligne de prix, quand l'offre en a une. */
  recurrent?: string | undefined
  recurrentDetail?: string | undefined
  inclus: string[]
  pourQui: string
  /** Mise en avant sur la page tarifs. */
  vedette?: boolean | undefined
  /** Contrainte honnête à afficher, jamais cachée en petits caractères. */
  limite?: string | undefined
}

export const OFFRES: Offre[] = produit.offres as Offre[]

/** Repère de marché cité sur la page tarifs. */
export const REPERE_MARCHE = {
  texte: 'Une station de matériel sportif en libre-service est annoncée autour de 4 500 € par an tout compris chez les acteurs installés sur les collectivités.',
  source: 'Equip Sport, tarif public 2025',
} as const

// ---------------------------------------------------------------------------
// Fiche technique
// ---------------------------------------------------------------------------

export interface SpecLine {
  poste: string
  valeur: string
  note?: string | undefined
}

/**
 * Spécifications de la borne de série. Le prototype d'octobre 2026 est monté
 * sur une armoire acier 9 cases (90 × 45 × 92,5 cm) dont 4 compartiments
 * motorisés : c'est une preuve de fonctionnement, pas le produit. Les cotes
 * ci-dessous sont donc annoncées comme provisoires tant que le prototype n'a
 * pas tourné — mentir sur une cote est le meilleur moyen de perdre un client
 * le jour de l'installation.
 */
export const SPECS: SpecLine[] = produit.specs as SpecLine[]

export const DOTATION = produit.dotation

/** Ce qu'on ne met pas dans un casier, dit franchement. */
export const HORS_CATALOGUE = produit.horsCatalogue

// ---------------------------------------------------------------------------
// Installation, SAV, engagements
// ---------------------------------------------------------------------------

export const ENGAGEMENTS = produit.engagements

/** Ce qui reste à la charge du camping. Écrit pour éviter le litige, pas pour l'éviter. */
export const A_VOTRE_CHARGE = produit.aVotreCharge

// ---------------------------------------------------------------------------
// Compatibilité logicielle — le point qui bloque tous les concurrents
// ---------------------------------------------------------------------------

export const PMS_MESSAGE = produit.pms

// ---------------------------------------------------------------------------
// Dimensionnement
// ---------------------------------------------------------------------------

/** Un point de distribution couvre confortablement ~120 emplacements. */
export const EMPLACEMENTS_PAR_BORNE = produit.emplacementsParBorne

export const recommendBornes = (emplacements: number): number =>
  Math.max(1, Math.min(4, Math.round(emplacements / EMPLACEMENTS_PAR_BORNE)))

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export type TenantSegment = 'camping'

export const SEGMENT_META = {
  camping: {
    slug: 'la-borne',
    label: 'La borne',
    pluralLabel: 'Campings et villages vacances',
    audienceType: 'Campings et hôtellerie de plein air',
    serviceName: 'Borne de prêt de matériel sportif pour campings',
  },
} as const

export function buildSegmentSchemas(segment: TenantSegment = 'camping'): Record<string, unknown>[] {
  const meta = SEGMENT_META[segment]
  const url = `${SITE.url}/${meta.slug}`

  return [
    {
      '@type': 'Product',
      name: meta.serviceName,
      description:
        'Borne de 8 casiers connectés installée en camping. Le vacancier emprunte ballon, raquette ou matériel de plage 24 h/24 avec son numéro de séjour, sans mobiliser l’accueil.',
      brand: { '@type': 'Brand', name: SITE.name },
      audience: { '@type': 'BusinessAudience', name: meta.audienceType },
      url,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'EUR',
        lowPrice: 894,
        highPrice: 5290,
        offerCount: OFFRES.length,
        description: 'Saison pilote, achat, ou location saisonnière.',
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: meta.label, item: url },
      ],
    },
  ]
}
