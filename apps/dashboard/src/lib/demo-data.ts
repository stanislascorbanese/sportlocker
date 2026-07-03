import type {
  AdminUser, AuditEvent, Commune, DailyPoint, DistributorDetail,
  Item, ItemTypeAdmin, MaintenanceTicket, Reservation, ReservationDetail,
  ReservationEvent, StatsDashboard,
} from './api'

/**
 * Données fictives affichées quand l'API admin renvoie 401 ou 0 résultats.
 * Permet de voir le rendu des onglets Réservations / Maintenance avant
 * d'avoir branché un token admin valide ou des données réelles.
 *
 * Tous les UUID respectent le format pour passer la validation Zod côté pages.
 */

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60 * 1000).toISOString()
}

function isoMinutesFromNow(min: number): string {
  return new Date(Date.now() + min * 60 * 1000).toISOString()
}

function isoHoursAgo(h: number): string {
  return isoMinutesAgo(h * 60)
}

/** Série fictive pour le sparkline 7 jours. Profil "activité réaliste"
 *  (creux le mercredi, pic le week-end). Les dates sont calculées à chaque rendu. */
export function demoReservationsDaily(days = 7): DailyPoint[] {
  // Profil cyclique d0..d6 (dimanche → samedi)
  const profile = [22, 12, 14, 10, 18, 28, 31]
  const out: DailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    const dow = d.getUTCDay()
    const base = profile[dow] ?? 15
    // Légère variation déterministe basée sur le jour pour éviter le motif trop régulier
    const jitter = ((d.getUTCDate() * 7) % 5) - 2
    out.push({
      date: d.toISOString().slice(0, 10),
      count: Math.max(0, base + jitter),
    })
  }
  return out
}

/** Dataset stats démo plausible : daily series sur N jours + tous les agrégats. */
export function demoStatsDashboard(days = 30): StatsDashboard {
  // Daily : profil cyclique (creux mercredi, pic week-end) avec jitter déterministe
  const profile = [22, 12, 14, 10, 18, 28, 31]
  const daily: DailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    const dow = d.getUTCDay()
    const base = profile[dow] ?? 15
    const jitter = ((d.getUTCDate() * 7) % 5) - 2
    daily.push({
      date: d.toISOString().slice(0, 10),
      count: Math.max(0, base + jitter),
    })
  }

  const total = daily.reduce((a, p) => a + p.count, 0)
  // Répartition réaliste : 60% returned, 18% active, 7% overdue, 8% cancelled, 4% expired, 3% pending
  const byStatus = [
    { status: 'returned'  as const, count: Math.round(total * 0.60) },
    { status: 'active'    as const, count: Math.round(total * 0.18) },
    { status: 'overdue'   as const, count: Math.round(total * 0.07) },
    { status: 'cancelled' as const, count: Math.round(total * 0.08) },
    { status: 'expired'   as const, count: Math.round(total * 0.04) },
    { status: 'pending'   as const, count: Math.round(total * 0.03) },
  ]

  const topDistributors = [
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', name: 'Parc des Buttes-Chaumont',         serialNumber: 'SL-PARIS-019', count: Math.round(total * 0.32) },
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', name: 'Berges de Seine — Île Saint-Louis', serialNumber: 'SL-PARIS-024', count: Math.round(total * 0.28) },
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', name: 'Place de la République',            serialNumber: 'SL-PARIS-031', count: Math.round(total * 0.22) },
    { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', name: 'Parc Montsouris',                   serialNumber: 'SL-PARIS-007', count: Math.round(total * 0.18) },
  ]

  const topItemTypes = [
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', name: 'Ballon de basket',         count: Math.round(total * 0.31) },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', name: 'Ballon de foot',           count: Math.round(total * 0.26) },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', name: 'Raquette de tennis',       count: Math.round(total * 0.21) },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', name: 'Boules de pétanque (set)', count: Math.round(total * 0.13) },
    { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', name: 'Frisbee',                  count: Math.round(total * 0.09) },
  ]

  // Heatmap : pic 17h-19h en semaine, pic 11h-13h et 15h-18h week-end
  const hourly: StatsDashboard['hourly'] = []
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      let count = 0
      const isWeekend = dow === 0 || dow === 6
      if (hour >= 9 && hour <= 21) {
        if (isWeekend) {
          if (hour >= 11 && hour <= 13) count = 6 + (hour - 11)
          else if (hour >= 15 && hour <= 18) count = 5 + Math.min(2, 18 - hour)
          else count = 2
        } else {
          if (hour >= 17 && hour <= 19) count = 7 + (hour - 17)
          else if (hour >= 12 && hour <= 13) count = 4
          else count = hour < 12 ? 1 : 3
        }
      }
      if (count > 0) hourly.push({ dow, hour, count })
    }
  }

  return { days, daily, byStatus, topDistributors, topItemTypes, hourly }
}

/** Génère une timeline plausible pour une réservation démo selon son statut. */
export function demoReservationDetail(r: Reservation): ReservationDetail {
  const events: ReservationEvent[] = []
  const pushEvent = (
    iso: string,
    type: ReservationEvent['eventType'],
    source = 'api',
    metadata: Record<string, unknown> = {},
  ) => {
    events.push({
      id: `aaaaaaaa-0000-0000-0000-${events.length.toString().padStart(12, '0')}`,
      eventType: type,
      source,
      metadata,
      createdAt: iso,
    })
  }

  // Toujours : reservation créée → event 'reserved'
  pushEvent(r.createdAt, 'reserved')

  if (r.openedAt) pushEvent(r.openedAt, 'opened')
  if (r.extensionCount > 0 && r.openedAt && r.dueAt) {
    // approximation : extension survient avant la deadline
    const mid = new Date(
      (new Date(r.openedAt).getTime() + new Date(r.dueAt).getTime()) / 2,
    ).toISOString()
    pushEvent(mid, 'extended', 'api', { extensionCount: r.extensionCount, addedMinutes: 60 })
  }
  if (r.returnedAt) pushEvent(r.returnedAt, 'returned')
  if (r.status === 'cancelled') {
    pushEvent(r.createdAt, 'cancelled', 'api', { reason: 'user_cancel' })
  }
  if (r.status === 'expired') {
    pushEvent(r.expiresAt, 'expired', 'system')
  }

  return {
    ...r,
    cancellationReason: r.status === 'cancelled' ? 'user_cancel' : null,
    qrJti: r.id.replace(/-/g, ''),
    events,
  }
}

export const DEMO_ADMIN_USERS: AdminUser[] = [
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff01',
    email: 'alice.martin@example.fr',
    displayName: 'Alice Martin',
    phone: '+33 6 11 22 33 44',
    role: 'citizen',
    trustScore: 100,
    totalReservations: 47,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', name: 'Paris 11e' },
    lastActiveAt: isoMinutesAgo(35),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 90),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff02',
    email: 'paul.durand@example.fr',
    displayName: 'Paul Durand',
    phone: '+33 6 55 66 77 88',
    role: 'citizen',
    trustScore: 95,
    totalReservations: 22,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02', name: 'Lyon 7e' },
    lastActiveAt: isoHoursAgo(2),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 60),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff03',
    email: 'leila.benali@example.fr',
    displayName: 'Leïla Benali',
    phone: null,
    role: 'citizen',
    trustScore: 72,
    totalReservations: 14,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', name: 'Paris 11e' },
    lastActiveAt: isoHoursAgo(8),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 45),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff04',
    email: 'fraudster@spam.example',
    displayName: null,
    phone: null,
    role: 'citizen',
    trustScore: 12,
    totalReservations: 5,
    isBanned: true,
    bannedReason: '3 retours hors délai + 1 item endommagé non signalé',
    commune: null,
    lastActiveAt: isoHoursAgo(24 * 14),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 70),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff05',
    email: 'thomas.lefebvre@example.fr',
    displayName: 'Thomas Lefebvre',
    phone: '+33 6 12 34 56 78',
    role: 'citizen',
    trustScore: 88,
    totalReservations: 9,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03', name: 'Marseille 8e' },
    lastActiveAt: isoHoursAgo(48),
    gdprDeleteRequestedAt: isoHoursAgo(24 * 3),
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 120),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff06',
    email: 'sophie.r@example.fr',
    displayName: 'Sophie R.',
    phone: null,
    role: 'citizen',
    trustScore: 100,
    totalReservations: 1,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01', name: 'Paris 11e' },
    lastActiveAt: isoHoursAgo(72),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 7),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff07',
    email: 'marc.tech@sportlocker.fr',
    displayName: 'Marc Tech',
    phone: '+33 6 98 76 54 32',
    role: 'operator',
    trustScore: 100,
    totalReservations: 0,
    isBanned: false,
    bannedReason: null,
    commune: null,
    lastActiveAt: isoHoursAgo(1),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 180),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff08',
    email: 'julie.r@sportlocker.fr',
    displayName: 'Julie R.',
    phone: null,
    role: 'operator',
    trustScore: 100,
    totalReservations: 0,
    isBanned: false,
    bannedReason: null,
    commune: null,
    lastActiveAt: isoHoursAgo(4),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 150),
  },
  {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffff09',
    email: 'stanislas@sportlocker.fr',
    displayName: 'Stanislas C.',
    phone: null,
    role: 'admin',
    trustScore: 100,
    totalReservations: 0,
    isBanned: false,
    bannedReason: null,
    commune: null,
    lastActiveAt: isoMinutesAgo(2),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: isoHoursAgo(24 * 365),
  },
]

export const DEMO_COMMUNES: Commune[] = [
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
    inseeCode: '75111',
    name: 'Paris 11e',
    postalCode: '75011',
    department: '75',
    region: 'Île-de-France',
    population: 147017,
    contractStart: '2025-09-01',
    contractEnd: '2027-08-31',
    monthlyFeeCents: 1500_00,
    contactEmail: 'contrats@mairie11.paris.fr',
    contactPhone: '+33 1 53 27 11 00',
    distributorCount: 8,
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02',
    inseeCode: '69387',
    name: 'Lyon 7e',
    postalCode: '69007',
    department: '69',
    region: 'Auvergne-Rhône-Alpes',
    population: 84057,
    contractStart: '2026-01-01',
    contractEnd: '2027-12-31',
    monthlyFeeCents: 800_00,
    contactEmail: 'sports@mairie-lyon.fr',
    contactPhone: '+33 4 78 92 73 00',
    distributorCount: 4,
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03',
    inseeCode: '13208',
    name: 'Marseille 8e',
    postalCode: '13008',
    department: '13',
    region: 'Provence-Alpes-Côte d\'Azur',
    population: 80022,
    contractStart: '2025-11-15',
    contractEnd: '2026-11-14',
    monthlyFeeCents: 1200_00,
    contactEmail: 'maires.adjoints@marseille.fr',
    contactPhone: '+33 4 91 55 88 00',
    distributorCount: 6,
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee04',
    inseeCode: '44109',
    name: 'Nantes',
    postalCode: '44000',
    department: '44',
    region: 'Pays de la Loire',
    population: 320732,
    contractStart: null,
    contractEnd: null,
    monthlyFeeCents: 0,
    contactEmail: 'pilote.sport@nantesmetropole.fr',
    contactPhone: null,
    distributorCount: 0,
  },
]

const DEMO_USERS = [
  { id: '11111111-1111-1111-1111-111111111111', email: 'alice.martin@example.fr',  displayName: 'Alice Martin' },
  { id: '22222222-2222-2222-2222-222222222222', email: 'paul.durand@example.fr',   displayName: 'Paul Durand' },
  { id: '33333333-3333-3333-3333-333333333333', email: 'leila.benali@example.fr',  displayName: 'Leïla Benali' },
  { id: '44444444-4444-4444-4444-444444444444', email: 'thomas.lefebvre@example.fr', displayName: 'Thomas Lefebvre' },
  { id: '55555555-5555-5555-5555-555555555555', email: 'sophie.r@example.fr',      displayName: null },
] as const

const DEMO_DISTRIBUTORS = [
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', name: 'Parc des Buttes-Chaumont', serialNumber: 'SL-PARIS-019' },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', name: 'Berges de Seine — Île Saint-Louis', serialNumber: 'SL-PARIS-024' },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', name: 'Place de la République', serialNumber: 'SL-PARIS-031' },
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', name: 'Parc Montsouris', serialNumber: 'SL-PARIS-007' },
] as const

// Snapshot ultra-léger pour les réservations démo (juste id + typeName).
// Renommé pour ne pas collisionner avec DEMO_ITEMS (articles physiques complets).
const DEMO_RESERVATION_ITEMS = [
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', typeName: 'Ballon de basket' },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', typeName: 'Raquette de tennis' },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', typeName: 'Frisbee' },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', typeName: 'Ballon de foot' },
  { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5', typeName: 'Boules de pétanque (set)' },
] as const

export const DEMO_RESERVATIONS: Reservation[] = [
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc01',
    status: 'active',
    createdAt: isoMinutesAgo(35),
    expiresAt: isoMinutesAgo(20),
    openedAt:  isoMinutesAgo(28),
    returnedAt: null,
    dueAt:     isoMinutesFromNow(180),
    extensionCount: 0,
    user: DEMO_USERS[0],
    distributor: DEMO_DISTRIBUTORS[0],
    item: DEMO_RESERVATION_ITEMS[0],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc02',
    status: 'pending',
    createdAt: isoMinutesAgo(8),
    expiresAt: isoMinutesFromNow(7),
    openedAt:  null,
    returnedAt: null,
    dueAt:     null,
    extensionCount: 0,
    user: DEMO_USERS[1],
    distributor: DEMO_DISTRIBUTORS[1],
    item: DEMO_RESERVATION_ITEMS[1],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc03',
    status: 'overdue',
    createdAt: isoHoursAgo(5),
    expiresAt: isoHoursAgo(4),
    openedAt:  isoHoursAgo(4),
    returnedAt: null,
    dueAt:     isoHoursAgo(1),
    extensionCount: 2,
    user: DEMO_USERS[2],
    distributor: DEMO_DISTRIBUTORS[2],
    item: DEMO_RESERVATION_ITEMS[2],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc04',
    status: 'returned',
    createdAt: isoHoursAgo(3),
    expiresAt: isoHoursAgo(2),
    openedAt:  isoHoursAgo(2),
    returnedAt: isoMinutesAgo(45),
    dueAt:     isoMinutesFromNow(120),
    extensionCount: 1,
    user: DEMO_USERS[3],
    distributor: DEMO_DISTRIBUTORS[0],
    item: DEMO_RESERVATION_ITEMS[3],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc05',
    status: 'cancelled',
    createdAt: isoHoursAgo(8),
    expiresAt: isoHoursAgo(7),
    openedAt:  null,
    returnedAt: null,
    dueAt:     null,
    extensionCount: 0,
    user: DEMO_USERS[4],
    distributor: DEMO_DISTRIBUTORS[3],
    item: DEMO_RESERVATION_ITEMS[4],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc06',
    status: 'returned',
    createdAt: isoHoursAgo(26),
    expiresAt: isoHoursAgo(25),
    openedAt:  isoHoursAgo(25),
    returnedAt: isoHoursAgo(22),
    dueAt:     isoHoursAgo(21),
    extensionCount: 0,
    user: DEMO_USERS[0],
    distributor: DEMO_DISTRIBUTORS[1],
    item: DEMO_RESERVATION_ITEMS[1],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc07',
    status: 'expired',
    createdAt: isoHoursAgo(48),
    expiresAt: isoHoursAgo(47),
    openedAt:  null,
    returnedAt: null,
    dueAt:     null,
    extensionCount: 0,
    user: DEMO_USERS[2],
    distributor: DEMO_DISTRIBUTORS[2],
    item: DEMO_RESERVATION_ITEMS[2],
  },
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccc08',
    status: 'active',
    createdAt: isoMinutesAgo(95),
    expiresAt: isoMinutesAgo(80),
    openedAt:  isoMinutesAgo(87),
    returnedAt: null,
    dueAt:     isoMinutesFromNow(60),
    extensionCount: 0,
    user: DEMO_USERS[3],
    distributor: DEMO_DISTRIBUTORS[3],
    item: DEMO_RESERVATION_ITEMS[0],
  },
]

export const DEMO_ITEM_TYPES: ItemTypeAdmin[] = [
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    slug: 'ballon-basket',
    name: 'Ballon de basket',
    category: 'ballon',
    description: 'Ballon de basket taille 7, mousse haute densité. Convient indoor et outdoor.',
    imageUrl: null,
    cautionCents: 20_00,
    maxDurationMinutes: 240,
    activeItemCount: 24,
    totalReservations: 412,
    createdAt: isoHoursAgo(24 * 240),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    slug: 'raquette-tennis',
    name: 'Raquette de tennis',
    category: 'raquette',
    description: 'Raquette adulte taille standard, cordage poly. Fournie sans balles.',
    imageUrl: null,
    cautionCents: 35_00,
    maxDurationMinutes: 180,
    activeItemCount: 18,
    totalReservations: 287,
    createdAt: isoHoursAgo(24 * 230),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    slug: 'frisbee',
    name: 'Frisbee',
    category: 'accessoire',
    description: 'Disque ultimate 175g, plastique souple.',
    imageUrl: null,
    cautionCents: 10_00,
    maxDurationMinutes: 120,
    activeItemCount: 12,
    totalReservations: 121,
    createdAt: isoHoursAgo(24 * 180),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
    slug: 'ballon-foot',
    name: 'Ballon de foot',
    category: 'ballon',
    description: 'Ballon taille 5, cuir synthétique, gonflé à 0.8 bar.',
    imageUrl: null,
    cautionCents: 20_00,
    maxDurationMinutes: 240,
    activeItemCount: 30,
    totalReservations: 358,
    createdAt: isoHoursAgo(24 * 210),
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb5',
    slug: 'petanque-set',
    name: 'Boules de pétanque (set)',
    category: 'autre',
    description: 'Set de 6 boules acier + cochonnet, dans sa sacoche.',
    imageUrl: null,
    cautionCents: 50_00,
    maxDurationMinutes: 180,
    activeItemCount: 8,
    totalReservations: 92,
    createdAt: isoHoursAgo(24 * 160),
  },
]

const DEMO_LOCKER_REFS = [
  { id: 'a1111111-1111-1111-1111-111111111111', position: 0, distributor: DEMO_DISTRIBUTORS[0] },
  { id: 'a1111111-1111-1111-1111-111111111112', position: 1, distributor: DEMO_DISTRIBUTORS[0] },
  { id: 'a2222222-2222-2222-2222-222222222221', position: 0, distributor: DEMO_DISTRIBUTORS[1] },
  { id: 'a2222222-2222-2222-2222-222222222222', position: 1, distributor: DEMO_DISTRIBUTORS[1] },
  { id: 'a3333333-3333-3333-3333-333333333331', position: 0, distributor: DEMO_DISTRIBUTORS[2] },
  { id: 'a4444444-4444-4444-4444-444444444441', position: 0, distributor: DEMO_DISTRIBUTORS[3] },
] as const

const DEMO_COMMUNE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01'

export const DEMO_ITEMS: Item[] = [
  {
    id: 'c0bbbbbb-1111-1111-1111-aaaaaaaaaaa1',
    rfidTag: 'RFID-BB-0001',
    condition: 'new',
    totalLoans: 12,
    lastInspectedAt: isoHoursAgo(24 * 3),
    createdAt: isoHoursAgo(24 * 60),
    itemType: { id: DEMO_ITEM_TYPES[0]!.id, slug: DEMO_ITEM_TYPES[0]!.slug, name: DEMO_ITEM_TYPES[0]!.name, category: DEMO_ITEM_TYPES[0]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[0].id, position: DEMO_LOCKER_REFS[0].position,
      distributor: { ...DEMO_LOCKER_REFS[0].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-1111-1111-1111-aaaaaaaaaaa2',
    rfidTag: 'RFID-BB-0002',
    condition: 'good',
    totalLoans: 47,
    lastInspectedAt: isoHoursAgo(24 * 7),
    createdAt: isoHoursAgo(24 * 120),
    itemType: { id: DEMO_ITEM_TYPES[0]!.id, slug: DEMO_ITEM_TYPES[0]!.slug, name: DEMO_ITEM_TYPES[0]!.name, category: DEMO_ITEM_TYPES[0]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[1].id, position: DEMO_LOCKER_REFS[1].position,
      distributor: { ...DEMO_LOCKER_REFS[1].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-2222-2222-2222-aaaaaaaaaaa1',
    rfidTag: 'RFID-TN-0001',
    condition: 'worn',
    totalLoans: 89,
    lastInspectedAt: isoHoursAgo(24 * 14),
    createdAt: isoHoursAgo(24 * 200),
    itemType: { id: DEMO_ITEM_TYPES[1]!.id, slug: DEMO_ITEM_TYPES[1]!.slug, name: DEMO_ITEM_TYPES[1]!.name, category: DEMO_ITEM_TYPES[1]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[2].id, position: DEMO_LOCKER_REFS[2].position,
      distributor: { ...DEMO_LOCKER_REFS[2].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-2222-2222-2222-aaaaaaaaaaa2',
    rfidTag: 'RFID-TN-0002',
    condition: 'damaged',
    totalLoans: 56,
    lastInspectedAt: isoHoursAgo(24 * 2),
    createdAt: isoHoursAgo(24 * 180),
    itemType: { id: DEMO_ITEM_TYPES[1]!.id, slug: DEMO_ITEM_TYPES[1]!.slug, name: DEMO_ITEM_TYPES[1]!.name, category: DEMO_ITEM_TYPES[1]!.category },
    currentLocker: null,
  },
  {
    id: 'c0bbbbbb-3333-3333-3333-aaaaaaaaaaa1',
    rfidTag: 'RFID-FR-0001',
    condition: 'new',
    totalLoans: 4,
    lastInspectedAt: null,
    createdAt: isoHoursAgo(24 * 20),
    itemType: { id: DEMO_ITEM_TYPES[2]!.id, slug: DEMO_ITEM_TYPES[2]!.slug, name: DEMO_ITEM_TYPES[2]!.name, category: DEMO_ITEM_TYPES[2]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[3].id, position: DEMO_LOCKER_REFS[3].position,
      distributor: { ...DEMO_LOCKER_REFS[3].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-4444-4444-4444-aaaaaaaaaaa1',
    rfidTag: 'RFID-FB-0001',
    condition: 'good',
    totalLoans: 31,
    lastInspectedAt: isoHoursAgo(24 * 5),
    createdAt: isoHoursAgo(24 * 95),
    itemType: { id: DEMO_ITEM_TYPES[3]!.id, slug: DEMO_ITEM_TYPES[3]!.slug, name: DEMO_ITEM_TYPES[3]!.name, category: DEMO_ITEM_TYPES[3]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[4].id, position: DEMO_LOCKER_REFS[4].position,
      distributor: { ...DEMO_LOCKER_REFS[4].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-4444-4444-4444-aaaaaaaaaaa2',
    rfidTag: 'RFID-FB-0002',
    condition: 'good',
    totalLoans: 22,
    lastInspectedAt: isoHoursAgo(24 * 11),
    createdAt: isoHoursAgo(24 * 90),
    itemType: { id: DEMO_ITEM_TYPES[3]!.id, slug: DEMO_ITEM_TYPES[3]!.slug, name: DEMO_ITEM_TYPES[3]!.name, category: DEMO_ITEM_TYPES[3]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[5].id, position: DEMO_LOCKER_REFS[5].position,
      distributor: { ...DEMO_LOCKER_REFS[5].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-4444-4444-4444-aaaaaaaaaaa3',
    rfidTag: 'RFID-FB-0003',
    condition: 'lost',
    totalLoans: 8,
    lastInspectedAt: isoHoursAgo(24 * 60),
    createdAt: isoHoursAgo(24 * 150),
    itemType: { id: DEMO_ITEM_TYPES[3]!.id, slug: DEMO_ITEM_TYPES[3]!.slug, name: DEMO_ITEM_TYPES[3]!.name, category: DEMO_ITEM_TYPES[3]!.category },
    currentLocker: null,
  },
  {
    id: 'c0bbbbbb-5555-5555-5555-aaaaaaaaaaa1',
    rfidTag: 'RFID-PE-0001',
    condition: 'good',
    totalLoans: 17,
    lastInspectedAt: isoHoursAgo(24 * 9),
    createdAt: isoHoursAgo(24 * 70),
    itemType: { id: DEMO_ITEM_TYPES[4]!.id, slug: DEMO_ITEM_TYPES[4]!.slug, name: DEMO_ITEM_TYPES[4]!.name, category: DEMO_ITEM_TYPES[4]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[0].id, position: DEMO_LOCKER_REFS[0].position,
      distributor: { ...DEMO_LOCKER_REFS[0].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
  {
    id: 'c0bbbbbb-5555-5555-5555-aaaaaaaaaaa2',
    rfidTag: 'RFID-PE-0002',
    condition: 'new',
    totalLoans: 0,
    lastInspectedAt: null,
    createdAt: isoHoursAgo(24 * 4),
    itemType: { id: DEMO_ITEM_TYPES[4]!.id, slug: DEMO_ITEM_TYPES[4]!.slug, name: DEMO_ITEM_TYPES[4]!.name, category: DEMO_ITEM_TYPES[4]!.category },
    currentLocker: {
      id: DEMO_LOCKER_REFS[2].id, position: DEMO_LOCKER_REFS[2].position,
      distributor: { ...DEMO_LOCKER_REFS[2].distributor, communeId: DEMO_COMMUNE_ID },
    },
  },
]

export const DEMO_MAINTENANCE_TICKETS: MaintenanceTicket[] = [
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd01',
    isAuto: false,
    openedBy: { id: '88888888-8888-8888-8888-888888888888', email: 'ops@sportlocker.fr', displayName: 'Ops Console' },
    status: 'open',
    severity: 5,
    title: 'Casier #3 bloqué — verrou ne s\'ouvre plus',
    description: 'Trois retours utilisateur cette semaine. Probable rupture du solénoïde, intervention urgente requise.',
    resolutionNote: null,
    resolvedAt: null,
    createdAt: isoHoursAgo(2),
    updatedAt: isoHoursAgo(2),
    distributor: DEMO_DISTRIBUTORS[0],
    assignee: null,
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd02',
    isAuto: true,
    openedBy: null,
    status: 'open',
    severity: 3,
    title: 'Lecteur QR encrassé',
    description: 'Taux d\'échec de scan élevé observé via la télémétrie firmware (38% sur 24h).',
    resolutionNote: null,
    resolvedAt: null,
    createdAt: isoHoursAgo(8),
    updatedAt: isoHoursAgo(8),
    distributor: DEMO_DISTRIBUTORS[2],
    assignee: null,
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd03',
    isAuto: false,
    openedBy: { id: '88888888-8888-8888-8888-888888888888', email: 'ops@sportlocker.fr', displayName: 'Ops Console' },
    status: 'open',
    severity: 2,
    title: 'Étiquette d\'identification décollée',
    description: 'Cosmétique. À recoller lors du prochain passage technicien.',
    resolutionNote: null,
    resolvedAt: null,
    createdAt: isoHoursAgo(30),
    updatedAt: isoHoursAgo(30),
    distributor: DEMO_DISTRIBUTORS[1],
    assignee: null,
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd04',
    isAuto: true,
    openedBy: null,
    status: 'in_progress',
    severity: 4,
    title: 'Heartbeat manquant depuis 12h',
    description: 'Distributeur silencieux. Probable problème réseau ou alimentation. Tech sur place.',
    resolutionNote: null,
    resolvedAt: null,
    createdAt: isoHoursAgo(14),
    updatedAt: isoHoursAgo(1),
    distributor: DEMO_DISTRIBUTORS[3],
    assignee: { id: '66666666-6666-6666-6666-666666666666', email: 'tech1@sportlocker.fr', displayName: 'Marc Tech' },
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd05',
    isAuto: false,
    openedBy: { id: '88888888-8888-8888-8888-888888888888', email: 'ops@sportlocker.fr', displayName: 'Ops Console' },
    status: 'in_progress',
    severity: 3,
    title: 'Calibration RFID dérive',
    description: 'Faux-positifs détectés sur les items 4 et 7. Tag à reprogrammer.',
    resolutionNote: null,
    resolvedAt: null,
    createdAt: isoHoursAgo(20),
    updatedAt: isoHoursAgo(3),
    distributor: DEMO_DISTRIBUTORS[0],
    assignee: { id: '77777777-7777-7777-7777-777777777777', email: 'tech2@sportlocker.fr', displayName: 'Julie R.' },
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd06',
    isAuto: true,
    openedBy: null,
    status: 'resolved',
    severity: 4,
    title: 'Panneau solaire encrassé — batterie à 22%',
    description: 'Détecté via heartbeat. Tension chute en fin de journée.',
    resolutionNote: 'Nettoyage panneau + ajustement angle. Charge nominale restaurée (96% le lendemain).',
    resolvedAt: isoHoursAgo(50),
    createdAt:  isoHoursAgo(72),
    updatedAt:  isoHoursAgo(50),
    distributor: DEMO_DISTRIBUTORS[2],
    assignee: { id: '66666666-6666-6666-6666-666666666666', email: 'tech1@sportlocker.fr', displayName: 'Marc Tech' },
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddd07',
    isAuto: false,
    openedBy: { id: '88888888-8888-8888-8888-888888888888', email: 'ops@sportlocker.fr', displayName: 'Ops Console' },
    status: 'wontfix',
    severity: 1,
    title: 'Bruit léger ventilation Raspberry Pi',
    description: 'Signalé par riverain. Niveau sonore < 30dB à 1m. Pas d\'action prévue.',
    resolutionNote: 'Niveau acceptable. Ticket fermé sans intervention.',
    resolvedAt: isoHoursAgo(100),
    createdAt:  isoHoursAgo(120),
    updatedAt:  isoHoursAgo(100),
    distributor: DEMO_DISTRIBUTORS[1],
    assignee: null,
  },
]

// ─── Audit / Activité ────────────────────────────────────────────────────────

/** Distributeurs étendus avec un communeId pour les events d'audit démo. */
const DEMO_AUDIT_DISTRIBUTORS = [
  { ...DEMO_DISTRIBUTORS[0], communeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' },
  { ...DEMO_DISTRIBUTORS[1], communeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' },
  { ...DEMO_DISTRIBUTORS[2], communeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01' },
  { ...DEMO_DISTRIBUTORS[3], communeId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02' },
] as const

const DEMO_LOCKERS = [
  { id: '99999999-0000-0000-0000-000000000001', position: 1 },
  { id: '99999999-0000-0000-0000-000000000002', position: 2 },
  { id: '99999999-0000-0000-0000-000000000003', position: 3 },
  { id: '99999999-0000-0000-0000-000000000004', position: 4 },
  { id: '99999999-0000-0000-0000-000000000005', position: 5 },
  { id: '99999999-0000-0000-0000-000000000006', position: 6 },
] as const

/**
 * Stream d'audit fictif — ~15 events plausibles couvrant la majorité des
 * scénarios attendus (cycle nominal réservation/ouverture/retour, plus
 * un cancelled source='admin' significatif pour la RGPD, une extension,
 * un fault et une maintenance). Tri DESC createdAt (plus récent en premier).
 */
export function demoAuditEvents(): AuditEvent[] {
  let counter = 0
  const event = (
    minutesAgo: number,
    eventType: AuditEvent['eventType'],
    source: AuditEvent['source'],
    distributorIdx: 0 | 1 | 2 | 3,
    lockerIdx: 0 | 1 | 2 | 3 | 4 | 5,
    metadata: Record<string, unknown> = {},
    userEmail: string | null = null,
  ): AuditEvent => {
    counter += 1
    const dist = DEMO_AUDIT_DISTRIBUTORS[distributorIdx]
    const lock = DEMO_LOCKERS[lockerIdx]
    return {
      id: `eeeeeeee-0000-0000-0000-${counter.toString().padStart(12, '0')}`,
      eventType,
      source,
      metadata,
      createdAt: isoMinutesAgo(minutesAgo),
      locker: { id: lock.id, position: lock.position },
      distributor: {
        id: dist.id,
        name: dist.name,
        serialNumber: dist.serialNumber,
        communeId: dist.communeId,
      },
      reservation: userEmail
        ? {
            id: `cccccccc-cccc-cccc-cccc-${counter.toString().padStart(12, '0')}`,
            userEmail,
          }
        : null,
    }
  }

  return [
    event(2,    'reserved',    'api',      0, 0, { itemTypeId: 'bbb...basket' },                'alice.martin@example.fr'),
    event(7,    'opened',      'firmware', 1, 1, { rssi: -62, latencyMs: 145 },                  'paul.durand@example.fr'),
    event(15,   'returned',    'firmware', 0, 0, { onTime: true, durationMin: 47 },              'alice.martin@example.fr'),
    event(28,   'extended',    'api',      2, 2, { extensionCount: 1, addedMinutes: 60 },        'leila.benali@example.fr'),
    event(42,   'cancelled',   'admin',    3, 3, { reason: 'admin_force_cancel', operator: 'stanislas@sportlocker.fr' }, 'thomas.lefebvre@example.fr'),
    event(55,   'opened',      'firmware', 1, 4, { rssi: -71 },                                  'sophie.r@example.fr'),
    event(70,   'returned',    'firmware', 1, 4, { onTime: true, durationMin: 33 },              'sophie.r@example.fr'),
    event(95,   'fault',       'firmware', 2, 5, { code: 'SOLENOID_TIMEOUT', attempts: 3 },      null),
    event(110,  'reserved',    'api',      0, 1, { itemTypeId: 'bbb...tennis' },                 'paul.durand@example.fr'),
    event(125,  'maintenance', 'admin',    2, 5, { ticketId: 'dddddddd-...-d01', severity: 5 },  null),
    event(150,  'expired',     'system',   3, 3, { afterMinutes: 15 },                           'leila.benali@example.fr'),
    event(180,  'opened',      'firmware', 0, 0, { rssi: -58 },                                  'thomas.lefebvre@example.fr'),
    event(220,  'cancelled',   'api',      3, 3, { reason: 'user_cancel' },                      'alice.martin@example.fr'),
    event(280,  'returned',    'firmware', 0, 0, { onTime: false, lateMinutes: 12 },             'thomas.lefebvre@example.fr'),
    event(360,  'reserved',    'api',      2, 2, { itemTypeId: 'bbb...frisbee' },                'leila.benali@example.fr'),
  ]
}

// ─── Distributor detail (page /distributors/[id]) ───────────────────────────

/**
 * Détail fictif d'un distributeur — utilisé quand l'API admin est indispo
 * sur la page /distributors/[id]. Couvre la majorité des états de casier
 * pour pouvoir vérifier le rendu de la grille.
 *
 * L'id passé doit matcher un id présent dans DEMO_DISTRIBUTORS sinon on
 * fabrique un détail générique 6 casiers.
 */
export function demoDistributorDetail(id: string): DistributorDetail {
  const known = DEMO_DISTRIBUTORS.find((d) => d.id === id)
  const name         = known?.name         ?? 'Distributeur démo'
  const serialNumber = known?.serialNumber ?? 'SL-DEMO-000'

  const ballonBasket = DEMO_ITEM_TYPES[0]!
  const raquette     = DEMO_ITEM_TYPES[1]!
  const ballonFoot   = DEMO_ITEM_TYPES[3]!

  return {
    id,
    serialNumber,
    name,
    status: 'online',
    communeId: DEMO_COMMUNE_ID,
    lockerCount: 6,
    idleLockers: 3,
    latitude: 48.8566,
    longitude: 2.3522,
    addressLine: '12 rue de la République, 75011 Paris',
    batteryPercent: null,
    lastSeenAt: isoMinutesAgo(2),
    lockers: [
      {
        id: 'a1111111-1111-1111-1111-111111111110',
        position: 0,
        state: 'idle',
        currentItemId: 'c0bbbbbb-1111-1111-1111-aaaaaaaaaaa1',
        itemType: {
          id: ballonBasket.id, slug: ballonBasket.slug, name: ballonBasket.name,
          category: ballonBasket.category, imageUrl: ballonBasket.imageUrl,
        },
      },
      {
        id: 'a1111111-1111-1111-1111-111111111111',
        position: 1,
        state: 'idle',
        currentItemId: 'c0bbbbbb-4444-4444-4444-aaaaaaaaaaa1',
        itemType: {
          id: ballonFoot.id, slug: ballonFoot.slug, name: ballonFoot.name,
          category: ballonFoot.category, imageUrl: ballonFoot.imageUrl,
        },
      },
      {
        id: 'a1111111-1111-1111-1111-111111111112',
        position: 2,
        state: 'active',
        currentItemId: 'c0bbbbbb-2222-2222-2222-aaaaaaaaaaa1',
        itemType: {
          id: raquette.id, slug: raquette.slug, name: raquette.name,
          category: raquette.category, imageUrl: raquette.imageUrl,
        },
      },
      {
        id: 'a1111111-1111-1111-1111-111111111113',
        position: 3,
        state: 'reserved',
        currentItemId: 'c0bbbbbb-1111-1111-1111-aaaaaaaaaaa2',
        itemType: {
          id: ballonBasket.id, slug: ballonBasket.slug, name: ballonBasket.name,
          category: ballonBasket.category, imageUrl: ballonBasket.imageUrl,
        },
      },
      {
        id: 'a1111111-1111-1111-1111-111111111114',
        position: 4,
        state: 'idle',
        currentItemId: null,
        itemType: null,
      },
      {
        id: 'a1111111-1111-1111-1111-111111111115',
        position: 5,
        state: 'fault',
        currentItemId: null,
        itemType: null,
      },
    ],
  }
}
