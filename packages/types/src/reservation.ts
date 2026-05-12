import { z } from 'zod'
import { ReservationStatus } from './enums.js'

export const Reservation = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  status: ReservationStatus,
  qrJti: z.string(),
  expiresAt: z.string().datetime(),
  openedAt: z.string().datetime().nullable(),
  returnedAt: z.string().datetime().nullable(),
})

export type Reservation = z.infer<typeof Reservation>

export const CreateReservationInput = z.object({
  distributorId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
})
export type CreateReservationInput = z.infer<typeof CreateReservationInput>
