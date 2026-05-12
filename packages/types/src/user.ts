import { z } from 'zod'
import { UserRole } from './enums.js'

export const User = z.object({
  id: z.string().uuid(),
  firebaseUid: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: UserRole,
  trustScore: z.number().int().min(0).max(100),
  isBanned: z.boolean(),
})

export type User = z.infer<typeof User>
