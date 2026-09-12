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
    // `titreCourt` sert la balise <title>, `serviceName` le balisage Schema.org.
    // Les deux ne peuvent pas être la même chaîne : le second doit être explicite
    // pour un moteur, le premier doit tenir en cinquante-huit caractères une fois
    // « — SportLocker » ajouté, sous peine d'être tronqué dans les résultats.
    titreCourt: 'Matériel de sport de camping, libre-service',
    // La méta-description ne peut pas être l'intro affichée : l'intro est écrite
    // pour être lue en haut de page, la description pour tenir en cent
    // cinquante caractères dans un résultat de recherche. Confondues, les trois
    // pages de segment sortaient entre 168 et 210 caractères — donc tronquées.
    metaDescription:
      'Une borne de 8 casiers connectés dans votre camping. Vos clients empruntent ballon ou raquette 24 h/24 avec leur numéro de séjour. Dès 149 € HT/mois.',
    argument: 'Deux critères de la grille Atout France, sans embaucher personne.',
  },
  hotel: {
    slug: 'hotels',
    label: 'Hôtels et résidences',
    pluralLabel: 'Hôtels, résidences de tourisme et apparthôtels',
    audienceType: 'Hôtellerie et résidences de tourisme',
    serviceName: 'Borne de prêt de matériel sportif pour hôtels et résidences',
    titreCourt: 'Matériel de sport pour hôtels et résidences',
    metaDescription:
      'Une borne de 8 casiers près de votre piscine. Vos clients prennent ballon, raquette ou matériel de plage avec leur numéro de chambre, à toute heure.',
    argument: 'Un service de plus à la réception, sans une minute de réception en plus.',
  },
  village: {
    slug: 'villages-vacances',
    label: 'Villages vacances',
    pluralLabel: 'Villages vacances et centres de séjour',
    audienceType: 'Villages vacances et centres de séjour',
    serviceName: 'Borne de prêt de matériel sportif pour villages vacances',
    titreCourt: 'Matériel de sport pour villages vacances',
    metaDescription:
      'Une borne de 8 casiers près de vos terrains. Les familles prennent le matériel avec leur numéro de séjour, même quand l’animateur est ailleurs.',
    argument: 'De quoi occuper les familles quand l’animateur est ailleurs.',
  },
  loisirs: {
    slug: 'bases-de-loisirs',
    label: 'Bases de loisirs',
    pluralLabel: 'Bases de loisirs et parcs résidentiels',
    audienceType: 'Bases de loisirs et parcs résidentiels de loisirs',
    serviceName: 'Borne de prêt de matériel sportif pour bases de loisirs',
    titreCourt: 'Matériel de sport pour bases de loisirs',
    metaDescription:
      'Une borne de 8 casiers au pied de vos terrains. Vos visiteurs prennent de quoi jouer avec leur réservation, sans local à ouvrir ni personnel dédié.',
    argument: 'Une activité de plus sur le site, sans personnel dédié.',
  },
} as const

/**
 * Les trois formules, en Schema.org.
 *
 * La page des tarifs portait un fil d'Ariane et rien d'autre : les prix y
 * étaient écrits en toutes lettres pour le lecteur et invisibles pour un
 * moteur, alors que l'accueil et les pages de segment, eux, déclaraient déjà un
 * `AggregateOffer`. C'était à l'envers — la fourchette était balisée partout
 * sauf là où les trois prix sont détaillés.
 *
 * Les montants sont ceux de `produit.json`, pas des copies : le total saison
 * pour la formule pilote (894 €) et pour la location (2 094 €), et la première
 * année pour l'achat (4 500 + 790). `valueAddedTaxIncluded: false` dit le HT,
 * qui est la seule façon honnête de baliser un prix B2B.
 */
export function buildOffresSchema(): Record<string, unknown>[] {
  const offre = (
    nom: string,
    slug: string,
    total: number,
    detail: string,
  ): Record<string, unknown> => ({
    '@type': 'Offer',
    name: nom,
    url: `${SITE.url}/tarifs#${slug}`,
    price: total,
    priceCurrency: 'EUR',
    description: detail,
    availability: 'https://schema.org/PreOrder',
    priceSpecification: {
      '@type': 'PriceSpecification',
      price: total,
      priceCurrency: 'EUR',
      valueAddedTaxIncluded: false,
    },
    seller: { '@type': 'Organization', name: SITE.name, url: SITE.url },
  })

  return [
    {
      '@type': 'Product',
      name: 'Borne SportLocker — 8 casiers connectés',
      description:
        'Borne de prêt de matériel de sport en libre-service pour campings, hôtels, villages vacances et bases de loisirs. Matériel, maintenance et remplacement des pièces d’usure compris dans les trois formules.',
      brand: { '@type': 'Brand', name: SITE.name },
      url: `${SITE.url}/tarifs`,
      offers: [
        offre(
          'Saison pilote 2027',
          'pilote',
          894,
          '149 € HT par mois sur les six mois de la saison, sans investissement.',
        ),
        offre(
          'Achat',
          'achat',
          5290,
          '4 500 € HT la borne installée et garnie, puis 790 € HT par saison.',
        ),
        offre(
          'Location saisonnière',
          'location',
          2094,
          '349 € HT par mois sur six mois, pose au printemps et reprise à l’automne.',
        ),
      ],
    },
  ]
}

/**
 * La fiche technique, en Schema.org.
 *
 * Dix lignes de spécifications écrites pour un exploitant qui vérifie si la
 * borne rentre chez lui — encombrement, alimentation, connexion. Balisées en
 * `additionalProperty`, elles deviennent lisibles par un moteur sans qu'on ait
 * à les recopier : la source reste `produit.json`.
 */
export function buildBorneSchema(): Record<string, unknown>[] {
  return [
    {
      '@type': 'Product',
      name: 'Borne SportLocker',
      description:
        'Borne de 8 casiers connectés pour le prêt de matériel de sport en libre-service. Prise 230 V, 4G intégrée, aucun génie civil.',
      brand: { '@type': 'Brand', name: SITE.name },
      url: `${SITE.url}/la-borne`,
      additionalProperty: SPECS.map((s) => ({
        '@type': 'PropertyValue',
        name: s.poste,
        value: s.valeur,
      })),
    },
  ]
}

/** Un fil d'Ariane à deux niveaux, pour les pages qui n'en avaient pas. */
export function buildFilAriane(nom: string, slug: string): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE.url + '/' },
      { '@type': 'ListItem', position: 2, name: nom, item: `${SITE.url}/${slug}` },
    ],
  }
}

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
