export const SITE = {
  name: 'SportLocker',
  legalName: 'SportLocker SAS',
  url: 'https://sportlocker.fr',
  email: 'contact@sportlocker.fr',
  description:
    'Distributeurs de matériel sportif en libre-service 24/7. Une solution clé en main pour mairies, campings et hôtels.',
  defaultOgImage: '/og-default.svg',
  twitterHandle: '@sportlocker',
} as const

export const NAV = [
  { href: '/#comment-ca-marche', label: 'Comment ça marche' },
  { href: '/mairies', label: 'Mairies' },
  { href: '/campings', label: 'Campings' },
  { href: '/hotels', label: 'Hôtels' },
  { href: '/couverture', label: 'Couverture' },
  { href: '/tarifs', label: 'Tarifs' },
] as const

export const PRICING = {
  mairie: { setupPerDist: 1000, monthlyPerDist: 425, commitMonths: 36 },
  camping: { setupPerDist: 850, monthlyPerDist: 400, commitMonths: 24 },
  hotel: { setupPerDist: 900, monthlyPerDist: 475, commitMonths: 24 },
} as const

export type TenantSegment = keyof typeof PRICING

// Marketplace : forfait citoyen + split commission (CDC §4.3)
export const MARKETPLACE = {
  citoyenForfait: 5,
  commissionRate: 0.25,
  tenantShareRate: 0.75,
  stripePayoutDelayDays: 2,
} as const

// Caution préautorisée par catégorie d'item (CDC §4.4)
export const DEPOSITS = [
  { category: 'Ballon foot / basket / frisbee', amount: 30, note: null },
  { category: 'Équipement plage (raquette plage, snorkel)', amount: 50, note: null },
  { category: 'Raquette tennis / badminton / ping-pong', amount: 80, note: null },
  { category: 'Équipement « pro » (valeur > 150 €)', amount: 150, note: 'Mandat SEPA in-app pour la différence éventuelle' },
] as const

// Métadonnées par segment pour SEO + structured data
export const SEGMENT_META: Record<TenantSegment, {
  slug: string
  label: string
  pluralLabel: string
  audienceType: string
  serviceName: string
}> = {
  mairie:  { slug: 'mairies',  label: 'Mairies',  pluralLabel: 'Mairies & collectivités',   audienceType: 'Mairies / Communes',         serviceName: 'Distributeur de matériel sportif pour collectivités' },
  camping: { slug: 'campings', label: 'Campings', pluralLabel: 'Campings & plages',          audienceType: 'Campings & sites de tourisme', serviceName: 'Distributeur de matériel sportif pour campings' },
  hotel:   { slug: 'hotels',   label: 'Hôtels',   pluralLabel: 'Hôtels 3★ / 4★ / 5★',         audienceType: 'Hôtels haut de gamme',        serviceName: 'Distributeur de matériel sportif pour hôtels' },
}

// Génère les schemas Service + BreadcrumbList pour une page segment.
// Le `@context` est ajouté côté Base.astro lors de la sérialisation.
export function buildSegmentSchemas(segment: TenantSegment): Record<string, unknown>[] {
  const meta = SEGMENT_META[segment]
  const pricing = PRICING[segment]
  const segmentUrl = `${SITE.url}/${meta.slug}`

  return [
    {
      '@type': 'Service',
      name: meta.serviceName,
      serviceType: 'Location de matériel sportif en libre-service',
      provider: { '@type': 'Organization', name: SITE.legalName, url: SITE.url },
      areaServed: { '@type': 'Country', name: 'France' },
      audience: { '@type': 'Audience', audienceType: meta.audienceType },
      url: segmentUrl,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: pricing.monthlyPerDist.toString(),
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: pricing.monthlyPerDist,
          priceCurrency: 'EUR',
          unitText: 'MON',
          referenceQuantity: {
            '@type': 'QuantitativeValue',
            value: 1,
            unitText: 'distributeur',
          },
        },
        eligibleDuration: {
          '@type': 'QuantitativeValue',
          value: pricing.commitMonths,
          unitCode: 'MON',
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
