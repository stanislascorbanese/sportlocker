import { z } from 'zod'

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

const ListDistributors = z.object({ items: z.array(Distributor) })
const ListItemTypes    = z.object({ items: z.array(ItemType) })

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000'

/** Header `Authorization: Bearer <token>` quand un token admin est dispo. */
function authHeaders(): Record<string, string> {
  const token = process.env.DASHBOARD_ADMIN_TOKEN
  return token ? { authorization: `Bearer ${token}` } : {}
}

export async function fetchDistributors(): Promise<Distributor[]> {
  const res = await fetch(`${API_URL}/v1/distributors`, {
    cache: 'no-store',
    next: { tags: ['distributors'] },
  })
  if (!res.ok) throw new Error(`API ${res.status} on /v1/distributors`)
  return ListDistributors.parse(await res.json()).items
}

export async function fetchDistributor(id: string): Promise<DistributorDetail> {
  const res = await fetch(`${API_URL}/v1/distributors/${id}`, {
    cache: 'no-store',
    next: { tags: ['distributors', `distributor:${id}`] },
  })
  if (res.status === 404) throw new Error('distributor_not_found')
  if (!res.ok) throw new Error(`API ${res.status} on /v1/distributors/${id}`)
  return DistributorDetail.parse(await res.json())
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  const res = await fetch(`${API_URL}/v1/item-types`, {
    cache: 'no-store',
    next: { tags: ['item-types'] },
  })
  if (!res.ok) throw new Error(`API ${res.status} on /v1/item-types`)
  return ListItemTypes.parse(await res.json()).items
}

/** Server-side only — appelée depuis Server Actions. Lève en cas d'erreur API. */
export async function createDistributor(input: DistributorCreateInput): Promise<Distributor> {
  const body = DistributorCreateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/distributors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await safeErrorBody(res)
    throw new ApiError(res.status, detail)
  }
  return Distributor.parse(await res.json())
}

export async function updateDistributor(
  id: string,
  input: DistributorUpdateInput,
): Promise<Distributor> {
  const body = DistributorUpdateInput.parse(input)
  const res = await fetch(`${API_URL}/v1/distributors/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await safeErrorBody(res)
    throw new ApiError(res.status, detail)
  }
  return Distributor.parse(await res.json())
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
