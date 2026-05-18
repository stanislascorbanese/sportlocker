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
  { href: '/comment-ca-marche', label: 'Comment ça marche' },
  { href: '/mairies', label: 'Mairies' },
  { href: '/campings', label: 'Campings' },
  { href: '/hotels', label: 'Hôtels' },
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
