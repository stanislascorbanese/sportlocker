import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  Distributor,
  DistributorDetail,
  DistributorLocker,
  LockerItemType,
} from '@sportlocker/types'

import { SESSION_COOKIE } from './session'

export { Distributor, DistributorDetail, DistributorLocker, LockerItemType }

export const LOCKER_STATES = ['idle', 'reserved', 'active', 'returning', 'fault'] as const
export type LockerState = typeof LOCKER_STATES[number]

export const ItemType = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  cautionCents: z.number().int().nonnegative(),
  maxDurationMinutes: z.number().int().positive(),
})

export type ItemType = z.infer<typeof ItemType>

export const ItemTypeAdmin = ItemType.extend({
  activeItemCount: z.number().int().nonnegative(),
  totalReservations: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})

export type ItemTypeAdmin = z.infer<typeof ItemTypeAdmin>

export const ItemTypeCreateInput = z.object({
  slug:               z.string().regex(/^[a-z0-9-]+$/, 'kebab-case requis').min(2).max(60),
  name:               z.string().min(1).max(120),
  category:           z.string().min(1).max(40),
  description:        z.string().max(2000).nullable().optional(),
  imageUrl:           z.string().url().max(500).nullable().optional(),
  cautionCents:       z.number().int().min(0).max(100_000_000),
  maxDurationMinutes: z.number().int().min(15).max(7 * 24 * 60),
})

export type ItemTypeCreateInput = z.infer<typeof ItemTypeCreateInput>

export const ItemTypeUpdateInput = z.object({
  name:               z.string().min(1).max(120).optional(),
  category:           z.string().min(1).max(40).optional(),
  description:        z.string().max(2000).nullable().optional(),
  imageUrl:           z.string().url().max(500).nullable().optional(),
  cautionCents:       z.number().int().min(0).max(100_000_000).optional(),
  maxDurationMinutes: z.number().int().min(15).max(7 * 24 * 60).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

export type ItemTypeUpdateInput = z.infer<typeof ItemTypeUpdateInput>

// Import + ré-export depuis api-enums (module client-safe sans next/headers).
// Le module séparé est nécessaire pour que les client components puissent
// importer ITEM_CONDITIONS sans embarquer tout lib/api.ts (qui contient
// `cookies` de next/headers) — sinon le build Next.js casse.
// cf. apps/dashboard/src/lib/api-enums.ts
import { ITEM_CONDITIONS, type ItemCondition } from './api-enums'
export { ITEM_CONDITIONS, type ItemCondition }

export const Item = z.object({
  id: z.string().uuid(),
  rfidTag: z.string(),
  condition: z.enum(ITEM_CONDITIONS),
  totalLoans: z.number().int().nonnegative(),
  lastInspectedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  itemType: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    category: z.string(),
  }),
  currentLocker: z.object({
    id: z.string().uuid(),
    position: z.number().int().nonnegative(),
    distributor: z.object({
      id: z.string().uuid(),
      name: z.string(),
      serialNumber: z.string(),
      communeId: z.string().uuid(),
    }),
  }).nullable(),
})

export type Item = z.infer<typeof Item>

export const ItemCreateInput = z.object({
  itemTypeId:      z.string().uuid(),
  rfidTag:         z.string().min(4).max(64),
  condition:       z.enum(ITEM_CONDITIONS).default('new'),
  currentLockerId: z.string().uuid().nullable().optional(),
})

export type ItemCreateInput = z.infer<typeof ItemCreateInput>

export const ItemUpdateInput = z.object({
  rfidTag:         z.string().min(4).max(64).optional(),
  condition:       z.enum(ITEM_CONDITIONS).optional(),
  currentLockerId: z.string().uuid().nullable().optional(),
  lastInspectedAt: z.string().datetime().nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

export type ItemUpdateInput = z.infer<typeof ItemUpdateInput>

export const DistributorCreateInput = z.object({
  serialNumber: z.string().min(3).max(40),
  communeId:    z.string().uuid(),
  name:         z.string().min(1).max(120),
  latitude:     z.number().min(-90).max(90).nullable().optional(),
  longitude:    z.number().min(-180).max(180).nullable().optional(),
  addressLine:  z.string().max(200).nullable().optional(),
  lockerCount:  z.number().int().min(1).max(64),
})

export type DistributorCreateInput = z.infer<typeof DistributorCreateInput>

export const DistributorUpdateInput = z.object({
  name:        z.string().min(1).max(120).optional(),
  status:      z.enum(['online', 'offline', 'maintenance', 'decommissioned']).optional(),
  latitude:    z.number().min(-90).max(90).nullable().optional(),
  longitude:   z.number().min(-180).max(180).nullable().optional(),
  addressLine: z.string().max(200).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

export type DistributorUpdateInput = z.infer<typeof DistributorUpdateInput>

export const RESERVATION_STATUSES = ['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'] as const
export type ReservationStatus = typeof RESERVATION_STATUSES[number]

export const Reservation = z.object({
  id: z.string().uuid(),
  status: z.enum(RESERVATION_STATUSES),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  openedAt: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  extensionCount: z.number().int().nonnegative(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
  }),
  item: z.object({
    id: z.string().uuid(),
    typeName: z.string(),
  }),
})

export type Reservation = z.infer<typeof Reservation>

export const LOCKER_EVENT_TYPES = [
  'reserved', 'opened', 'closed', 'returned',
  'expired', 'cancelled', 'fault', 'maintenance', 'extended',
] as const
export type LockerEventType = typeof LOCKER_EVENT_TYPES[number]

export const ReservationEvent = z.object({
  id: z.string().uuid(),
  eventType: z.enum(LOCKER_EVENT_TYPES),
  source: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
})

export type ReservationEvent = z.infer<typeof ReservationEvent>

export const ReservationDetail = Reservation.extend({
  cancellationReason: z.string().nullable(),
  qrJti: z.string(),
  events: z.array(ReservationEvent),
})

export type ReservationDetail = z.infer<typeof ReservationDetail>

export const ReservationsPage = z.object({
  items: z.array(Reservation),
  nextCursor: z.string().nullable(),
})

export type ReservationsPage = z.infer<typeof ReservationsPage>

export const MAINTENANCE_STATUSES = ['open', 'in_progress', 'resolved', 'wontfix'] as const
export type MaintenanceStatus = typeof MAINTENANCE_STATUSES[number]

export const MaintenanceTicket = z.object({
  id: z.string().uuid(),
  status: z.enum(MAINTENANCE_STATUSES),
  severity: z.number().int().min(1).max(5),
  title: z.string(),
  description: z.string().nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
  }),
  assignee: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }).nullable(),
})

export type MaintenanceTicket = z.infer<typeof MaintenanceTicket>

export const Commune = z.object({
  id: z.string().uuid(),
  inseeCode: z.string().length(5),
  name: z.string(),
  postalCode: z.string().length(5),
  department: z.string(),
  region: z.string(),
  population: z.number().int().nullable(),
  contractStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  contractEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  monthlyFeeCents: z.number().int().nonnegative(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  distributorCount: z.number().int().nonnegative(),
})

export type Commune = z.infer<typeof Commune>

export const CommuneCreateInput = z.object({
  inseeCode:       z.string().regex(/^\d{5}$/),
  name:            z.string().min(1).max(120),
  postalCode:      z.string().regex(/^\d{5}$/),
  department:      z.string().min(2).max(3),
  region:          z.string().min(1).max(60),
  population:      z.number().int().positive().nullable().optional(),
  contractStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractEnd:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyFeeCents: z.number().int().nonnegative().max(1_000_000),
  contactEmail:    z.string().email().max(180).nullable().optional(),
  contactPhone:    z.string().min(6).max(20).nullable().optional(),
})

export type CommuneCreateInput = z.infer<typeof CommuneCreateInput>

export const CommuneUpdateInput = z.object({
  name:            z.string().min(1).max(120).optional(),
  postalCode:      z.string().regex(/^\d{5}$/).optional(),
  department:      z.string().min(2).max(3).optional(),
  region:          z.string().min(1).max(60).optional(),
  population:      z.number().int().positive().nullable().optional(),
  contractStart:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  contractEnd:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthlyFeeCents: z.number().int().nonnegative().max(1_000_000).optional(),
  contactEmail:    z.string().email().max(180).nullable().optional(),
  contactPhone:    z.string().min(6).max(20).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

export type CommuneUpdateInput = z.infer<typeof CommuneUpdateInput>

const ListCommunes = z.object({ items: z.array(Commune) })

export const USER_ROLES = ['citizen', 'operator', 'admin', 'super_admin'] as const
export type UserRole = typeof USER_ROLES[number]

export const AdminUser = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.enum(USER_ROLES),
  trustScore: z.number().int().min(0).max(100),
  totalReservations: z.number().int().nonnegative(),
  isBanned: z.boolean(),
  bannedReason: z.string().nullable(),
  commune: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  lastActiveAt: z.string().datetime().nullable(),
  gdprDeleteRequestedAt: z.string().datetime().nullable(),
  gdprDeletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export type AdminUser = z.infer<typeof AdminUser>

const ListUsers = z.object({ items: z.array(AdminUser) })

export const UserUpdateInput = z.object({
  role:                  z.enum(USER_ROLES).optional(),
  isBanned:              z.boolean().optional(),
  bannedReason:          z.string().max(500).nullable().optional(),
  trustScore:            z.number().int().min(0).max(100).optional(),
  gdprDeleteRequestedAt: z.string().datetime().nullable().optional(),
})

export type UserUpdateInput = z.infer<typeof UserUpdateInput>

const ListDistributors = z.object({ items: z.array(Distributor) })
const ListItemTypes    = z.object({ items: z.array(ItemType) })
const ListMaintenance  = z.object({ items: z.array(MaintenanceTicket) })

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000'

/**
 * Header `Authorization: Bearer <sessionToken>` lu depuis le cookie httpOnly
 * posé par /api/session après login Firebase. Toujours appelé côté server.
 */
async function authHeaders(): Promise<Record<string, string>> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  return token ? { authorization: `Bearer ${token}` } : {}
}

/**
 * Gestion centralisée des réponses non-OK :
 *   401 → cookie expiré/invalide → redirect /login (throw NEXT_REDIRECT).
 *   autres → ApiError(status, detail).
 */
async function throwApiError(res: Response, fromPath = ''): Promise<never> {
  if (res.status === 401) {
    const url = fromPath ? `/login?redirect=${encodeURIComponent(fromPath)}` : '/login'
    redirect(url)
  }
  const detail = await safeErrorBody(res)
  throw new ApiError(res.status, detail)
}

export async function fetchDistributors(): Promise<Distributor[]> {
  const res = await fetch(`${API_URL}/v1/distributors`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['distributors'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListDistributors.parse(await res.json()).items
}

export async function fetchDistributor(id: string): Promise<DistributorDetail> {
  const res = await fetch(`${API_URL}/v1/distributors/${id}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['distributors', `distributor:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'distributor_not_found')
  if (!res.ok) await throwApiError(res)
  return DistributorDetail.parse(await res.json())
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  const res = await fetch(`${API_URL}/v1/item-types`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['item-types'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListItemTypes.parse(await res.json()).items
}

/** Server-side only — appelée depuis Server Actions. Lève en cas d'erreur API. */
export async function createDistributor(input: DistributorCreateInput): Promise<Distributor> {
  const body = DistributorCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/distributors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Distributor.parse(await res.json())
}

export async function updateDistributor(
  id: string,
  input: DistributorUpdateInput,
): Promise<Distributor> {
  const body = DistributorUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/distributors/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Distributor.parse(await res.json())
}

export type ReservationFilters = {
  status?: ReservationStatus
  distributorId?: string
  /** Date YYYY-MM-DD — borne basse inclusive */
  from?: string
  /** Date YYYY-MM-DD — borne haute inclusive (côté serveur : created_at < to+1j) */
  to?: string
  cursor?: string
  limit?: number
}

export async function fetchReservationDetail(id: string): Promise<ReservationDetail> {
  const res = await fetch(`${API_URL}/v1/admin/reservations/${id}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['reservations', `reservation:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'reservation_not_found')
  if (!res.ok) await throwApiError(res)
  return ReservationDetail.parse(await res.json())
}

export async function forceCancelReservation(id: string, reason?: string): Promise<ReservationDetail> {
  const res = await fetch(`${API_URL}/v1/admin/reservations/${id}/force-cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(reason ? { reason } : {}),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return ReservationDetail.parse(await res.json())
}

export type ReservationExportFilters = {
  status?: ReservationStatus
  distributorId?: string
  from?: string
  to?: string
}

export async function fetchReservationsCsv(filters: ReservationExportFilters = {}): Promise<string> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.distributorId) params.set('distributorId', filters.distributorId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to)   params.set('to', filters.to)
  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/reservations/export.csv${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return await res.text()
}

export async function fetchReservations(filters: ReservationFilters = {}): Promise<ReservationsPage> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.distributorId) params.set('distributorId', filters.distributorId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to)   params.set('to', filters.to)
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))

  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/reservations${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['reservations'] },
  })
  if (!res.ok) await throwApiError(res)
  return ReservationsPage.parse(await res.json())
}

export async function fetchCommunes(): Promise<Commune[]> {
  const res = await fetch(`${API_URL}/v1/admin/communes`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['communes'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListCommunes.parse(await res.json()).items
}

export async function fetchCommune(id: string): Promise<Commune> {
  const res = await fetch(`${API_URL}/v1/admin/communes/${id}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['communes', `commune:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'commune_not_found')
  if (!res.ok) await throwApiError(res)
  return Commune.parse(await res.json())
}

export async function createCommune(input: CommuneCreateInput): Promise<Commune> {
  const body = CommuneCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/communes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Commune.parse(await res.json())
}

export async function updateCommune(id: string, input: CommuneUpdateInput): Promise<Commune> {
  const body = CommuneUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/communes/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Commune.parse(await res.json())
}

export type UserFilters = {
  role?: UserRole
  banned?: 'true' | 'false'
  q?: string
}

export async function fetchUsers(filters: UserFilters = {}): Promise<AdminUser[]> {
  const params = new URLSearchParams()
  if (filters.role) params.set('role', filters.role)
  if (filters.banned) params.set('banned', filters.banned)
  if (filters.q) params.set('q', filters.q)
  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/users${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['users'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListUsers.parse(await res.json()).items
}

export async function updateUser(id: string, input: UserUpdateInput): Promise<AdminUser> {
  const body = UserUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return AdminUser.parse(await res.json())
}

export const DailyPoint = z.object({
  date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative(),
})

export type DailyPoint = z.infer<typeof DailyPoint>

const DailySeries = z.object({ points: z.array(DailyPoint) })

export const StatsDashboard = z.object({
  days: z.number().int(),
  daily: z.array(DailyPoint),
  byStatus: z.array(z.object({
    status: z.enum(RESERVATION_STATUSES),
    count: z.number().int().nonnegative(),
  })),
  topDistributors: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
    count: z.number().int().nonnegative(),
  })),
  topItemTypes: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    count: z.number().int().nonnegative(),
  })),
  hourly: z.array(z.object({
    dow: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    count: z.number().int().nonnegative(),
  })),
})

export type StatsDashboard = z.infer<typeof StatsDashboard>

export async function fetchStatsDashboard(days = 30): Promise<StatsDashboard> {
  const res = await fetch(`${API_URL}/v1/admin/stats/dashboard?days=${days}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['stats'] },
  })
  if (!res.ok) await throwApiError(res)
  return StatsDashboard.parse(await res.json())
}

export async function fetchReservationsDaily(days = 7): Promise<DailyPoint[]> {
  const res = await fetch(`${API_URL}/v1/admin/stats/reservations-daily?days=${days}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['stats'] },
  })
  if (!res.ok) await throwApiError(res)
  return DailySeries.parse(await res.json()).points
}

export type MaintenanceFilters = {
  status?: MaintenanceStatus
  distributorId?: string
}

export async function fetchMaintenanceTickets(filters: MaintenanceFilters = {}): Promise<MaintenanceTicket[]> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.distributorId) params.set('distributorId', filters.distributorId)

  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/maintenance-tickets${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['maintenance'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListMaintenance.parse(await res.json()).items
}

export const MaintenanceUpdateInput = z.object({
  status:         z.enum(MAINTENANCE_STATUSES).optional(),
  assignedTo:     z.string().uuid().nullable().optional(),
  resolutionNote: z.string().max(2000).nullable().optional(),
  severity:       z.number().int().min(1).max(5).optional(),
})

export type MaintenanceUpdateInput = z.infer<typeof MaintenanceUpdateInput>

export async function updateMaintenanceTicket(
  id: string,
  input: MaintenanceUpdateInput,
): Promise<MaintenanceTicket> {
  const body = MaintenanceUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/maintenance-tickets/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return MaintenanceTicket.parse(await res.json())
}

// ─── Audit / Activité (locker_events stream) ────────────────────────────────

export const AuditEvent = z.object({
  id:        z.string().uuid(),
  eventType: z.enum(LOCKER_EVENT_TYPES),
  source:    z.string(),
  metadata:  z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  locker: z.object({
    id:       z.string().uuid(),
    position: z.number().int(),
  }),
  distributor: z.object({
    id:           z.string().uuid(),
    name:         z.string(),
    serialNumber: z.string(),
    communeId:    z.string().uuid(),
  }),
  reservation: z.object({
    id:        z.string().uuid(),
    userEmail: z.string(),
  }).nullable(),
})

export type AuditEvent = z.infer<typeof AuditEvent>

export const AuditEventsPage = z.object({
  items: z.array(AuditEvent),
  nextCursor: z.string().nullable(),
})

export type AuditEventsPage = z.infer<typeof AuditEventsPage>

export type AuditFilters = {
  from?: string
  to?: string
  eventType?: LockerEventType
  source?: string
  distributorId?: string
  cursor?: string
  limit?: number
}

export async function fetchAuditEvents(filters: AuditFilters = {}): Promise<AuditEventsPage> {
  const params = new URLSearchParams()
  if (filters.from)          params.set('from', filters.from)
  if (filters.to)            params.set('to', filters.to)
  if (filters.eventType)     params.set('eventType', filters.eventType)
  if (filters.source)        params.set('source', filters.source)
  if (filters.distributorId) params.set('distributorId', filters.distributorId)
  if (filters.cursor)        params.set('cursor', filters.cursor)
  if (filters.limit)         params.set('limit', String(filters.limit))

  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/audit/recent${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['audit'] },
  })
  if (!res.ok) await throwApiError(res)
  return AuditEventsPage.parse(await res.json())
}

export const DistributorHealth = z.object({
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
    status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
    firmwareVersion: z.string().nullable(),
    lastSeenAt: z.string().datetime().nullable(),
  }),
  summary: z.object({
    windowHours: z.number().int(),
    heartbeatCount: z.number().int(),
    availabilityPct: z.number().min(0).max(100).nullable(),
    avgCpuTempC: z.number().nullable(),
    maxCpuTempC: z.number().nullable(),
    avgRssiDbm: z.number().nullable(),
    minFreeMemMb: z.number().int().nullable(),
  }),
  latest: z.object({
    receivedAt: z.string().datetime(),
    rssiDbm: z.number().int().nullable(),
    cpuTempC: z.number().nullable(),
    uptimeSeconds: z.number().int().nullable(),
    freeMemMb: z.number().int().nullable(),
  }).nullable(),
  series: z.array(z.object({
    bucket: z.string().datetime(),
    avgCpuTempC: z.number().nullable(),
    avgRssiDbm: z.number().nullable(),
    avgFreeMemMb: z.number().nullable(),
    count: z.number().int(),
  })),
})

export type DistributorHealth = z.infer<typeof DistributorHealth>

export async function fetchDistributorHealth(id: string, hours = 24): Promise<DistributorHealth> {
  const res = await fetch(`${API_URL}/v1/admin/distributors/${id}/health?hours=${hours}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['distributors', `distributor:${id}`, `distributor-health:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'distributor_not_found')
  if (!res.ok) await throwApiError(res)
  return DistributorHealth.parse(await res.json())
}

// ──────────────────────────────────────────────────────────────────────────
// Fleet health — vue agrégée multi-distributeurs (/health page)
// ──────────────────────────────────────────────────────────────────────────

export const FLEET_ALERTS = [
  'offline',
  'no_heartbeat_24h',
  'high_cpu_temp',
  'weak_signal',
  'low_memory',
  'open_critical',
] as const
export type FleetAlert = typeof FLEET_ALERTS[number]

export const FleetHealthRow = z.object({
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    serialNumber: z.string(),
    status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
    communeName: z.string().nullable(),
    firmwareVersion: z.string().nullable(),
    lastSeenAt: z.string().datetime().nullable(),
  }),
  latest: z.object({
    receivedAt: z.string().datetime().nullable(),
    cpuTempC: z.number().nullable(),
    rssiDbm: z.number().int().nullable(),
    freeMemMb: z.number().int().nullable(),
    uptimeSeconds: z.number().int().nullable(),
  }),
  openTickets: z.number().int(),
  criticalTickets: z.number().int(),
  alerts: z.array(z.enum(FLEET_ALERTS)),
})

export type FleetHealthRow = z.infer<typeof FleetHealthRow>

export const FleetHealthDashboard = z.object({
  generatedAt: z.string().datetime(),
  total: z.number().int(),
  withAlerts: z.number().int(),
  rows: z.array(FleetHealthRow),
})

export type FleetHealthDashboard = z.infer<typeof FleetHealthDashboard>

export async function fetchFleetHealth(): Promise<FleetHealthDashboard> {
  const res = await fetch(`${API_URL}/v1/admin/distributors/fleet-health`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['distributors', 'fleet-health'] },
  })
  if (!res.ok) await throwApiError(res)
  return FleetHealthDashboard.parse(await res.json())
}

export const Invite = z.object({
  token: z.string().min(20),
  inviteUrl: z.string().url(),
})

export type Invite = z.infer<typeof Invite>

export const InviteCreateInput = z.object({
  email:     z.string().email().max(180),
  communeId: z.string().uuid(),
})

export type InviteCreateInput = z.infer<typeof InviteCreateInput>

export async function createInvite(input: InviteCreateInput): Promise<Invite> {
  const body = InviteCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/invites`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Invite.parse(await res.json())
}

const ListAdminItemTypes = z.object({ items: z.array(ItemTypeAdmin) })
const ListItems          = z.object({ items: z.array(Item) })

export async function fetchAdminItemTypes(): Promise<ItemTypeAdmin[]> {
  const res = await fetch(`${API_URL}/v1/admin/item-types`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['item-types'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListAdminItemTypes.parse(await res.json()).items
}

export async function fetchAdminItemType(id: string): Promise<ItemTypeAdmin> {
  const res = await fetch(`${API_URL}/v1/admin/item-types/${id}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['item-types', `item-type:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'item_type_not_found')
  if (!res.ok) await throwApiError(res)
  return ItemTypeAdmin.parse(await res.json())
}

export async function createItemType(input: ItemTypeCreateInput): Promise<ItemTypeAdmin> {
  const body = ItemTypeCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/item-types`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return ItemTypeAdmin.parse(await res.json())
}

export async function updateItemType(id: string, input: ItemTypeUpdateInput): Promise<ItemTypeAdmin> {
  const body = ItemTypeUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/item-types/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return ItemTypeAdmin.parse(await res.json())
}

export async function deleteItemType(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/admin/item-types/${id}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
}

export type ItemFilters = {
  itemTypeId?: string
  condition?: ItemCondition
  distributorId?: string
  currentLockerId?: string
  q?: string
}

export async function fetchItems(filters: ItemFilters = {}): Promise<Item[]> {
  const params = new URLSearchParams()
  if (filters.itemTypeId) params.set('itemTypeId', filters.itemTypeId)
  if (filters.condition)  params.set('condition', filters.condition)
  if (filters.distributorId) params.set('distributorId', filters.distributorId)
  if (filters.currentLockerId) params.set('currentLockerId', filters.currentLockerId)
  if (filters.q) params.set('q', filters.q)
  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/items${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['items'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListItems.parse(await res.json()).items
}

export async function fetchItem(id: string): Promise<Item> {
  const res = await fetch(`${API_URL}/v1/admin/items/${id}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['items', `item:${id}`] },
  })
  if (res.status === 404) throw new ApiError(404, 'item_not_found')
  if (!res.ok) await throwApiError(res)
  return Item.parse(await res.json())
}

export async function createItem(input: ItemCreateInput): Promise<Item> {
  const body = ItemCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Item.parse(await res.json())
}

export async function updateItem(id: string, input: ItemUpdateInput): Promise<Item> {
  const body = ItemUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/admin/items/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return Item.parse(await res.json())
}

// ─── Tarification : pricing_rules (modèle slots PR 0008, day pass PR 0009) ─

export const DAY_PASS_MINUTES = 1440 as const

export const SLOT_DURATIONS = [30, 60, 90, 120, 1440] as const
export type SlotDurationMinutes = typeof SLOT_DURATIONS[number]

export function isDayPassDuration(d: number): boolean {
  return d === DAY_PASS_MINUTES
}

/** Libellé court d'une durée pour l'affichage UI. */
export function formatDurationLabel(min: number): string {
  if (min === DAY_PASS_MINUTES) return 'Journée'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const r = min % 60
  return r === 0 ? `${h} h` : `${h} h ${r}`
}

export const PricingRule = z.object({
  id: z.string().uuid(),
  communeId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  itemTypeSlug: z.string(),
  itemTypeName: z.string(),
  durationMinutes: z.number().int(),
  priceCents: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PricingRule = z.infer<typeof PricingRule>

const ListPricingRules = z.object({ items: z.array(PricingRule) })

export async function fetchPricingRules(communeId?: string): Promise<PricingRule[]> {
  const qs = communeId ? `?communeId=${encodeURIComponent(communeId)}` : ''
  const res = await fetch(`${API_URL}/v1/admin/pricing-rules${qs}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['pricing-rules'] },
  })
  if (!res.ok) await throwApiError(res)
  return ListPricingRules.parse(await res.json()).items
}

export async function upsertPricingRule(input: {
  itemTypeId: string
  durationMinutes: SlotDurationMinutes
  priceCents: number
  communeId?: string
}): Promise<PricingRule> {
  const res = await fetch(`${API_URL}/v1/admin/pricing-rules`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return PricingRule.parse(await res.json())
}

export async function bulkUpsertPricingRules(input: {
  rules: Array<{ itemTypeId: string; durationMinutes: SlotDurationMinutes; priceCents: number }>
  communeId?: string
}): Promise<{ applied: number }> {
  const res = await fetch(`${API_URL}/v1/admin/pricing-rules/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(input),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return z.object({ applied: z.number().int().nonnegative() }).parse(await res.json())
}

export async function deletePricingRule(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/admin/pricing-rules/${id}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
}

// ─── Stripe Connect (PR G1) ──────────────────────────────────────────────

export const StripeConnectStatus = z.object({
  connected: z.boolean(),
  accountId: z.string().nullable(),
  chargesEnabled: z.boolean(),
  payoutsEnabled: z.boolean(),
  onboardedAt: z.string().datetime().nullable(),
})

export type StripeConnectStatus = z.infer<typeof StripeConnectStatus>

export const StripeConnectOnboardResponse = z.object({
  url: z.string().url(),
  accountId: z.string(),
  expiresAt: z.number().int(),
})

export type StripeConnectOnboardResponse = z.infer<typeof StripeConnectOnboardResponse>

/**
 * Récupère l'état Stripe Connect de la commune scopée (admin) ou explicite
 * (super_admin → `communeId` requis).
 *
 * Renvoie 503 silencieux si l'API n'a pas STRIPE_SECRET_KEY configuré côté
 * serveur — le caller doit gérer (UI "Stripe non configuré côté serveur").
 */
export async function fetchStripeConnectStatus(
  communeId?: string,
): Promise<StripeConnectStatus | { notConfigured: true }> {
  const qs = communeId ? `?communeId=${encodeURIComponent(communeId)}` : ''
  const res = await fetch(`${API_URL}/v1/admin/stripe-connect/status${qs}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
  })
  if (res.status === 503) return { notConfigured: true }
  if (!res.ok) await throwApiError(res)
  return StripeConnectStatus.parse(await res.json())
}

/**
 * Démarre l'onboarding Stripe Connect : crée l'Account Express si manquant
 * et retourne un AccountLink hosted (URL Stripe vers laquelle le caller
 * redirige immédiatement le user).
 */
export async function startStripeConnectOnboarding(
  communeId?: string,
): Promise<StripeConnectOnboardResponse> {
  const res = await fetch(`${API_URL}/v1/admin/stripe-connect/onboard`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(communeId ? { communeId } : {}),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return StripeConnectOnboardResponse.parse(await res.json())
}

/**
 * Pull le status Stripe depuis l'API Stripe et met à jour les flags en DB.
 * À appeler quand le user revient du flow Stripe-hosted (return URL) ou via
 * un bouton "Rafraîchir le statut" dans l'UI.
 */
export async function refreshStripeConnectStatus(
  communeId?: string,
): Promise<StripeConnectStatus> {
  const res = await fetch(`${API_URL}/v1/admin/stripe-connect/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(communeId ? { communeId } : {}),
    cache: 'no-store',
  })
  if (!res.ok) await throwApiError(res)
  return StripeConnectStatus.parse(await res.json())
}

// ─── Paiements de location (transactions) ────────────────────────────────

export const PAYMENT_STATUS = ['pending', 'succeeded', 'failed', 'cancelled', 'refunded'] as const
export type PaymentStatus = typeof PAYMENT_STATUS[number]

export const AdminPayment = z.object({
  id: z.string().uuid(),
  status: z.enum(PAYMENT_STATUS),
  amountCents: z.number().int().nonnegative(),
  currency: z.string(),
  provider: z.string(),
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  reservation: z.object({
    id: z.string().uuid(),
    status: z.string(),
  }),
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
  }),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  item: z.object({
    typeName: z.string(),
  }),
})

export type AdminPayment = z.infer<typeof AdminPayment>

export const AdminPaymentsPage = z.object({
  items: z.array(AdminPayment),
  nextCursor: z.string().nullable(),
})

export type AdminPaymentsPage = z.infer<typeof AdminPaymentsPage>

export type PaymentFilters = {
  status?: PaymentStatus
  cursor?: string
  limit?: number
}

/**
 * Liste paginée des paiements de location (transactions citoyennes).
 * Scope multi-tenant côté API : admin = sa commune, super_admin = tout.
 */
export async function fetchAdminPayments(filters: PaymentFilters = {}): Promise<AdminPaymentsPage> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.limit) params.set('limit', String(filters.limit))

  const qs = params.toString()
  const res = await fetch(`${API_URL}/v1/admin/payments${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeaders()) },
    cache: 'no-store',
    next: { tags: ['payments'] },
  })
  if (!res.ok) await throwApiError(res)
  return AdminPaymentsPage.parse(await res.json())
}

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(`API ${status}: ${detail}`)
    this.name = 'ApiError'
  }
}

async function safeErrorBody(res: Response): Promise<string> {
  try {
    const json = await res.json() as { error?: string; message?: string }
    return json.error ?? json.message ?? res.statusText
  } catch {
    return res.statusText
  }
}
