import { z } from 'zod'
import { DistributorStatus } from './enums.js'

export const Distributor = z.object({
  id: z.string().uuid(),
  serialNumber: z.string(),
  name: z.string(),
  communeId: z.string().uuid(),
  status: DistributorStatus,
  lockerCount: z.number().int().positive(),
  firmwareVersion: z.string().optional(),
  lastSeenAt: z.string().datetime().nullable(),
})

export type Distributor = z.infer<typeof Distributor>
