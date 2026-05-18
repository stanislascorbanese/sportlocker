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
  { href: '/tarifs', label: 'Tarifs' },
] as const

export const PRICING = {
  mairie: { setupPerDist: 1000, monthlyPerDist: 425, commitMonths: 36 },
  camping: { setupPerDist: 850, monthlyPerDist: 400, commitMonths: 24 },
  autre: { setupPerDist: 1000, monthlyPerDist: 450, commitMonths: 24 },
} as const

export type TenantSegment = keyof typeof PRICING
