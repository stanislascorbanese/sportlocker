import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { SESSION_COOKIE } from './session'

export const Distributor = z.object({
  id: z.string().uuid(),
  serialNumber: z.string(),
  name: z.string(),
  status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
  communeId: z.string().uuid(),
  lockerCount: z.number().int().nonnegative(),
  idleLockers: z.number().int().nonnegative(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  lastSeenAt: z.string().datetime().nullable(),
})

export type Distributor = z.infer<typeof Distributor>

export const DistributorDetail = Distributor.extend({
  lockers: z.array(z.object({
    id: z.string().uuid(),
    position: z.number().int(),
    state: z.enum(['idle', 'reserved', 'active', 'returning', 'fault']),
    currentItemId: z.string().uuid().nullable(),
  })),
})

export type DistributorDetail = z.infer<typeof DistributorDetail>

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

export const DistributorCreateInput = z.object({
  serialNumber: z.string().min(3).max(40),
  communeId:    z.string().uuid(),
  name:         z.string().min(1).max(120),
  latitude:     z.number().min(-90).max(90).nullable().optional(),
  longitude:    z.number().min(-180).max(180).nullable().optional(),
  lockerCount:  z.number().int().min(1).max(64),
})

export type DistributorCreateInput = z.infer<typeof DistributorCreateInput>

export const DistributorUpdateInput = z.object({
  name:      z.string().min(1).max(120).optional(),
  status:    z.enum(['online', 'offline', 'maintenance', 'decommissioned']).optional(),
  latitude:  z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'at_least_one_field_required' })

export type DistributorUpdateInput = z.infer<typeof DistributorUpdateInput>

export const RESERVATION_STATUSES = ['pending', 'active', 'returned', 'overdue', 'cancelled', 'expired'] as const
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

export const USER_ROLES = ['citizen', 'operator', 'admin'] as const
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
