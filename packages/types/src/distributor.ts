import { z } from 'zod'
import { DistributorStatus, LockerState } from './enums'

/**
 * DTO miroir de `services/api/src/routes/distributors.ts` (DistributorDTO).
 * Source de vérité partagée entre dashboard, citizen et mobile — la divergence
 * locale précédente a été refactorisée pour éviter trois définitions parallèles
 * qui dérivaient à chaque évolution de la route.
 */
export const Distributor = z.object({
  id: z.string().uuid(),
  serialNumber: z.string(),
  name: z.string(),
  status: DistributorStatus,
  communeId: z.string().uuid(),
  lockerCount: z.number().int().positive(),
  idleLockers: z.number().int().nonnegative(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  addressLine: z.string().max(200).nullable(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  lastSeenAt: z.string().datetime().nullable(),
})

export type Distributor = z.infer<typeof Distributor>

export const LockerItemType = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  imageUrl: z.string().nullable(),
})

export type LockerItemType = z.infer<typeof LockerItemType>

export const DistributorLocker = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  state: LockerState,
  currentItemId: z.string().uuid().nullable(),
  itemType: LockerItemType.nullable(),
})

export type DistributorLocker = z.infer<typeof DistributorLocker>

export const DistributorDetail = Distributor.extend({
  lockers: z.array(DistributorLocker),
})

export type DistributorDetail = z.infer<typeof DistributorDetail>

/** Distributeur retourné par `/v1/distributors/nearby` — DTO + distance Haversine. */
export const NearbyDistributor = Distributor.extend({
  distanceKm: z.number().min(0),
})

export type NearbyDistributor = z.infer<typeof NearbyDistributor>
