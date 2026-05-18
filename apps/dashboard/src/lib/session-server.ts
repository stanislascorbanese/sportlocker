import { cookies } from 'next/headers'

import { SESSION_COOKIE, decodeSession, isSessionExpired, type SessionPayload } from './session'

/**
 * Lit le cookie httpOnly et renvoie la payload décodée (sans vérif signature
 * — la vraie vérif est côté API à chaque requête).
 */
export async function getSessionUser(): Promise<SessionPayload | null> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) return null
  const payload = decodeSession(token)
  if (!payload || isSessionExpired(payload)) return null
  return payload
}
