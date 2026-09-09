// Source unique de vérité de la vitrine.
//
// Version 2 — septembre 2026. Le modèle « marketplace de créneaux payants
// vendue aux communes, commission de 25 % via Stripe Connect » a été abandonné
// (voir docs/CDC.md v2). Ont disparu d'ici, volontairement :
//   - MARKETPLACE / SLOT_DURATIONS / PRICING_TEMPLATES / DEPOSITS
//     → SportLocker n'encaisse plus rien du vacancier.
//   - subsidyRate() → l'ANS ne finance plus les équipements de proximité en
//     2026, et une DETR ne finance jamais un abonnement de fonctionnement.
//   - LOCATIONS_PER_DIST_PER_DAY = 10 → chiffre inventé, aucune borne n'a
//     jamais tourné. Rien ne le remplace tant qu'une saison n'est pas passée.

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
  { href: '/campings', label: 'Pour les campings' },
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
] as const

// ---------------------------------------------------------------------------
// Offre commerciale
// ---------------------------------------------------------------------------

export const OFFRE = {
  /** Achat de la borne, installée et garnie. */
  prixBorne: 4500,
  /** Abonnement logiciel + maintenance + remplacement du matériel d'usure. */
  aboSaison: 790,
  /** Offre de repli : location saisonnière, SportLocker reste propriétaire. */
  loyerMensuel: 349,
  moisSaison: 6,
  /** Nombre d'articles fournis à l'installation. */
  articlesInclus: 12,
  /** Casiers par borne. */
  casiers: 8,
} as const

export const loyerSaison = OFFRE.loyerMensuel * OFFRE.moisSaison

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
    slug: 'campings',
    label: 'Campings',
    pluralLabel: 'Campings et villages vacances',
    audienceType: 'Campings et hôtellerie de plein air',
    serviceName: 'Borne de prêt de matériel sportif pour campings',
  },
} as const

export function buildSegmentSchemas(segment: TenantSegment = 'camping'): Record<string, unknown>[] {
  const meta = SEGMENT_META[segment]
  const segmentUrl = `${SITE.url}/${meta.slug}`

  return [
    {
      '@type': 'Service',
      name: meta.serviceName,
      serviceType: 'Mise à disposition de matériel sportif en libre-service',
      provider: { '@type': 'Organization', name: SITE.legalName, url: SITE.url },
      areaServed: { '@type': 'AdministrativeArea', name: 'Façade atlantique, France' },
      audience: { '@type': 'Audience', audienceType: meta.audienceType },
      url: segmentUrl,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: OFFRE.prixBorne.toString(),
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: OFFRE.prixBorne,
          priceCurrency: 'EUR',
          referenceQuantity: {
            '@type': 'QuantitativeValue',
            value: 1,
            unitText: 'borne installée',
          },
        },
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: meta.label, item: segmentUrl },
      ],
    },
  ]
}
