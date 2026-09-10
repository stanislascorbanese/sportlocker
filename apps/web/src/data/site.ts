// Source unique de vérité de la vitrine.
//
// Version 4 — septembre 2026. Le site s'adresse à un exploitant d'hébergement
// de loisirs privé de la côte atlantique, entre novembre et février, qui arbitre
// un budget d'équipement pour la saison suivante.
//
// Le camping reste en tête partout — c'est là qu'on a la preuve (le classement
// Atout France), la géographie (premier département de France) et les chiffres.
// Mais le produit ne demande rien de propre au camping : une réception, un
// logiciel de réservation, une référence de séjour, du 230 V. Un hôtel, un
// village vacances ou une base de loisirs remplissent les quatre.
//
// Le public reste écarté, et ce n'est pas un oubli : Equip Sport y est installé
// et gratuit, il faut une régie de recettes, une AOT sur le domaine public et du
// solaire. Voir claude/SportLocker_Refonte_2026.md, § 3.1.
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
    'Le matériel de sport de votre établissement, en libre-service 24 h/24, sans mobiliser votre accueil.',
  defaultOgImage: '/og-default.png',
  twitterHandle: '@sportlocker',
} as const

// Cinq entrées courtes, pas six longues : à six, la barre passait sur deux
// lignes dès 1440 px. « Contact » est sortie — le bouton « Demander un devis »
// pointe déjà là, et une barre de navigation qui répète son propre bouton
// dépense de la place pour rien.
export const NAV = [
  { href: '/la-borne', label: 'La borne' },
  { href: '/pour-qui', label: 'Pour qui' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/installation-sav', label: 'Installation' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
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

export type TenantSegment = 'camping' | 'hotel' | 'village' | 'loisirs'

/**
 * Les publics visés, dans l'ordre de priorité commerciale.
 *
 * `argument` est ce que le segment vient chercher, et ce n'est pas le même d'un
 * segment à l'autre : le camping défend son classement, l'hôtel défend sa note
 * en ligne, le village vacances occupe des familles à la semaine, la base de
 * loisirs vend une activité de plus. Un site qui leur servirait la même phrase
 * ne parlerait à aucun des quatre.
 */
export const SEGMENT_META = {
  camping: {
    slug: '',
    label: 'Campings',
    pluralLabel: 'Campings et hôtellerie de plein air',
    audienceType: 'Campings et hôtellerie de plein air',
    serviceName: 'Borne de prêt de matériel sportif pour campings',
    argument: 'Deux critères de la grille Atout France, sans embaucher personne.',
  },
  hotel: {
    slug: 'hotels',
    label: 'Hôtels et résidences',
    pluralLabel: 'Hôtels, résidences de tourisme et apparthôtels',
    audienceType: 'Hôtellerie et résidences de tourisme',
    serviceName: 'Borne de prêt de matériel sportif pour hôtels et résidences',
    argument: 'Un service de plus à la réception, sans une minute de réception en plus.',
  },
  village: {
    slug: 'villages-vacances',
    label: 'Villages vacances',
    pluralLabel: 'Villages vacances et centres de séjour',
    audienceType: 'Villages vacances et centres de séjour',
    serviceName: 'Borne de prêt de matériel sportif pour villages vacances',
    argument: 'De quoi occuper les familles quand l’animateur est ailleurs.',
  },
  loisirs: {
    slug: 'bases-de-loisirs',
    label: 'Bases de loisirs',
    pluralLabel: 'Bases de loisirs et parcs résidentiels',
    audienceType: 'Bases de loisirs et parcs résidentiels de loisirs',
    serviceName: 'Borne de prêt de matériel sportif pour bases de loisirs',
    argument: 'Une activité de plus sur le site, sans personnel dédié.',
  },
} as const

/** Les segments autres que le camping, pour les listes « pour qui ». */
export const AUTRES_SEGMENTS: TenantSegment[] = ['hotel', 'village', 'loisirs']

export function buildSegmentSchemas(segment: TenantSegment = 'camping'): Record<string, unknown>[] {
  const meta = SEGMENT_META[segment]
  const url = meta.slug ? `${SITE.url}/${meta.slug}` : `${SITE.url}/`

  return [
    {
      '@type': 'Product',
      name: meta.serviceName,
      description:
        `Borne de 8 casiers connectés. Le client emprunte ballon, raquette ou matériel de plage 24 h/24 avec sa référence de séjour, sans mobiliser l’accueil. Public : ${meta.pluralLabel.toLowerCase()}.`,
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
        ...(meta.slug
          ? [{ '@type': 'ListItem', position: 2, name: meta.label, item: url }]
          : []),
      ],
    },
  ]
}
