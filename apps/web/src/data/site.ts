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

// Dimensionnement automatique : règles métier pour proposer un nb de distributeurs
// adapté à la taille du site. Bornes calées sur les retours pilote (densité d'usage).
export const SIZING: Record<
  TenantSegment,
  {
    unit: string                   // libellé affiché ("habitants", "emplacements", "chambres")
    unitShort: string              // libellé court pour la projection ("hab.", "empl.", "ch.")
    minSize: number
    maxSize: number
    defaultSize: number
    perDistributor: number         // 1 dist. pour N unités
    maxDistributors: number
  }
> = {
  mairie:  { unit: 'habitants',    unitShort: 'hab.',   minSize: 500,  maxSize: 80000, defaultSize: 6500,  perDistributor: 2500, maxDistributors: 8 },
  camping: { unit: 'emplacements', unitShort: 'empl.',  minSize: 30,   maxSize: 800,   defaultSize: 180,   perDistributor: 100,  maxDistributors: 5 },
  hotel:   { unit: 'chambres',     unitShort: 'ch.',    minSize: 20,   maxSize: 400,   defaultSize: 90,    perDistributor: 80,   maxDistributors: 4 },
}

export const recommendDistributors = (segment: TenantSegment, size: number): number => {
  const cfg = SIZING[segment]
  return Math.max(1, Math.min(cfg.maxDistributors, Math.round(size / cfg.perDistributor)))
}

// Estimation indicative de subventions cumulables pour les communes :
// ANS (Plan 5 000 équipements + équipements de proximité), DETR, DSIL.
// Taux dégressifs avec la population — priorité accordée à la ruralité par les guichets.
// Source : barèmes publics 2025 — valeurs conservatrices, à confirmer en instruction réelle.
export const subsidyRate = (population: number): number => {
  if (population < 3500) return 0.5
  if (population < 20000) return 0.35
  if (population < 100000) return 0.2
  return 0.1
}

// Hypothèse de charge mature d'un distributeur (CDC §6.2 — modèle financier)
export const LOCATIONS_PER_DIST_PER_DAY = 10
