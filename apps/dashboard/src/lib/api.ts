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

const ListResponse = z.object({ items: z.array(Distributor) })

const API_URL = process.env.INTERNAL_API_URL ?? 'http://localhost:3000'

/**
 * Server-side fetch. `cache: 'no-store'` pour éviter la mise en cache build-time
 * de Next.js — les distributeurs changent d'état en temps réel.
 */
export async function fetchDistributors(): Promise<Distributor[]> {
  const res = await fetch(`${API_URL}/v1/distributors`, {
    cache: 'no-store',
    next: { tags: ['distributors'] },
  })
  if (!res.ok) {
    throw new Error(`API ${res.status} on /v1/distributors`)
  }
  const json: unknown = await res.json()
  return ListResponse.parse(json).items
}
