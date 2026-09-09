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
  recurrent?: string
  recurrentDetail?: string
  inclus: string[]
  pourQui: string
  /** Mise en avant sur la page tarifs. */
  vedette?: boolean
  /** Contrainte honnête à afficher, jamais cachée en petits caractères. */
  limite?: string
}

export const OFFRES: Offre[] = [
  {
    slug: 'pilote',
    label: 'Saison pilote 2027',
    pitch: 'Vous testez une saison entière sans rien investir.',
    prix: '149 € HT / mois',
    prixDetail: 'sur les 6 mois de la saison, soit 894 € HT',
    inclus: [
      'Borne installée et garnie, posée avant votre ouverture',
      'Matériel sportif fourni et remplacé',
      'Application, tableau de bord, maintenance',
      'Reprise de la borne en fin de saison si vous n’enchaînez pas',
    ],
    pourQui: 'Les trois premiers campings équipés, en Vendée et Loire-Atlantique.',
    limite:
      'Trois sites maximum pour la saison 2027. En échange : vos retours d’usage, et le droit de citer votre camping.',
    vedette: true,
  },
  {
    slug: 'achat',
    label: 'Achat',
    pitch: 'La borne vous appartient et s’amortit.',
    prix: '4 500 € HT',
    prixDetail: 'borne installée et garnie de 12 articles',
    recurrent: '+ 790 € HT / saison',
    recurrentDetail: 'application, maintenance à distance, remplacement du matériel d’usure',
    inclus: [
      'Borne 8 casiers, installée et mise en service',
      '12 articles de dotation au choix dans le catalogue',
      'Formation de votre accueil, 10 minutes',
      'Garantie 2 ans pièces et main-d’œuvre',
    ],
    pourQui: 'Les campings qui préfèrent immobiliser une fois et ne plus y penser.',
  },
  {
    slug: 'location',
    label: 'Location saisonnière',
    pitch: 'Rien à immobiliser, on pose au printemps et on reprend à l’automne.',
    prix: '349 € HT / mois',
    prixDetail: 'sur 6 mois, soit 2 094 € HT la saison',
    inclus: [
      'Borne, matériel, application, maintenance : tout compris',
      'Pose avant l’ouverture, dépose après la fermeture',
      'Remplacement immédiat en cas de panne bloquante',
      'SportLocker reste propriétaire',
    ],
    pourQui:
      'Les campings dont le budget d’investissement est déjà engagé ailleurs, ou qui veulent une saison de plus avant de s’engager.',
  },
]

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
  note?: string
}

/**
 * Spécifications de la borne de série. Le prototype d'octobre 2026 est monté
 * sur une armoire acier 9 cases (90 × 45 × 92,5 cm) dont 4 compartiments
 * motorisés : c'est une preuve de fonctionnement, pas le produit. Les cotes
 * ci-dessous sont donc annoncées comme provisoires tant que le prototype n'a
 * pas tourné — mentir sur une cote est le meilleur moyen de perdre un client
 * le jour de l'installation.
 */
export const SPECS: SpecLine[] = [
  { poste: 'Casiers', valeur: '8 casiers individuels', note: 'un article par casier' },
  {
    poste: 'Encombrement',
    valeur: '≈ 90 × 50 × 180 cm (L × P × H)',
    note: 'provisoire — figé après le prototype d’octobre 2026',
  },
  { poste: 'Fixation', valeur: 'Au sol ou murale', note: 'aucun génie civil, aucune dalle à couler' },
  {
    poste: 'Alimentation',
    valeur: '230 V, prise standard, ≈ 30 W en veille',
    note: 'onduleur intégré : la borne survit à une coupure',
  },
  {
    poste: 'Connexion',
    valeur: '4G intégrée, carte SIM fournie',
    note: 'aucun raccordement à votre réseau, aucun accès à votre wifi',
  },
  {
    poste: 'Ouverture',
    valeur: 'Code signé vérifié par la borne elle-même',
    note: 'une coupure 4G n’empêche pas vos clients d’emprunter',
  },
  { poste: 'Détection du retour', valeur: 'Capteur de fermeture sur chaque porte' },
  { poste: 'Interface', valeur: 'Le smartphone du vacancier', note: 'pas d’écran à casser ni à nettoyer' },
  { poste: 'Emplacement conseillé', valeur: 'Près du terrain multisports ou de l’espace aquatique', note: 'à l’abri si possible, sous auvent ou préau' },
  { poste: 'Mise en service', valeur: 'Une demi-journée sur site' },
]

export const DOTATION = [
  { titre: 'Ballons', detail: 'Football, basket, volley' },
  { titre: 'Raquettes', detail: 'Ping-pong, badminton, beach-tennis, avec balles et volants' },
  { titre: 'Matériel de plage', detail: 'Frisbees, mölkky, jeux de boules' },
  { titre: 'Accessoires de terrain', detail: 'Chasubles, plots, cordes à sauter' },
]

/** Ce qu'on ne met pas dans un casier, dit franchement. */
export const HORS_CATALOGUE =
  'Ni vélo, ni paddle, ni kayak : seulement ce qui rentre dans un casier et se range en dix secondes.'

// ---------------------------------------------------------------------------
// Installation, SAV, engagements
// ---------------------------------------------------------------------------

export const ENGAGEMENTS = [
  {
    titre: 'Devis sous 48 h',
    detail: 'Après une visite de site de trente minutes, ou un échange en visio si vous êtes loin.',
  },
  {
    titre: 'Installation en une demi-journée',
    detail: 'Entre la commande et la mise en service : 4 à 6 semaines, hors période de fabrication de série.',
  },
  {
    titre: 'Intervention sous 48 h en saison',
    detail: 'Vendée, Loire-Atlantique et Charente-Maritime. Nous sommes à moins d’une heure de route de la plupart des sites.',
  },
  {
    titre: 'Garantie 2 ans',
    detail: 'Pièces et main-d’œuvre sur la borne. Le matériel sportif d’usure est remplacé au titre de l’abonnement.',
  },
  {
    titre: 'Pièces détachées tenues en stock',
    detail: 'Serrures, capteurs, cartes électroniques. Une serrure se remplace en dix minutes sans démonter la borne.',
  },
  {
    titre: 'Dossier d’exploitation remis à l’installation',
    detail:
      'Attestation d’assurance responsabilité civile professionnelle et produit, déclaration de conformité CE, registre de maintenance, et la procédure d’ouverture manuelle en cas de panne.',
  },
]

/** Ce qui reste à la charge du camping. Écrit pour éviter le litige, pas pour l'éviter. */
export const A_VOTRE_CHARGE = [
  'Une prise 230 V à proximité de l’emplacement retenu.',
  'Remettre le matériel dans les casiers vides — l’écran de réassort vous dit lesquels.',
  'Facturer sur le compte séjour ce qui n’est pas rendu, avec la caution que vous détenez déjà.',
  'Assurer la borne au titre de votre multirisque professionnelle, comme le reste de vos équipements.',
]

// ---------------------------------------------------------------------------
// Compatibilité logicielle — le point qui bloque tous les concurrents
// ---------------------------------------------------------------------------

export const PMS_MESSAGE = {
  titre: 'Rien à changer dans votre logiciel',
  corps:
    'SportLocker ne se branche pas sur votre PMS et ne vous demande pas de le faire évoluer. Vous voyez la liste de ce qui n’est pas rentré, avec le nom du client et son emplacement, et vous le passez en mise en compte comme vous le faites déjà pour un vélo ou la laverie.',
  cite: 'eSeason, Naxi Commerce, Secureholiday : aucune adaptation nécessaire, quel que soit le vôtre.',
} as const

// ---------------------------------------------------------------------------
// Dimensionnement
// ---------------------------------------------------------------------------

/** Un point de distribution couvre confortablement ~120 emplacements. */
export const EMPLACEMENTS_PAR_BORNE = 120

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
