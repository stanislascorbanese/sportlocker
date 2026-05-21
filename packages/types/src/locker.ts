import { z } from 'zod'
import { LockerState } from './enums'

export const Locker = z.object({
  id: z.string().uuid(),
  distributorId: z.string().uuid(),
  position: z.number().int().min(0),
  state: LockerState,
  currentItemId: z.string().uuid().nullable(),
})

export type Locker = z.infer<typeof Locker>
