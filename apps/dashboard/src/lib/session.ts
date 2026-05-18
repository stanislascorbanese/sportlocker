import { z } from 'zod'

export const SESSION_COOKIE = 'sl_session'

export const SESSION_ROLES = ['super_admin', 'admin', 'operator'] as const
export type SessionRole = typeof SESSION_ROLES[number]

const SessionPayload = z.object({
  sub: z.string(),
  email: z.string(),
  role: z.enum(SESSION_ROLES),
  communeId: z.string().nullable().optional(),
  exp: z.number().int(),
  iat: z.number().int().optional(),
})

export type SessionPayload = z.infer<typeof SessionPayload>

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/')
  if (typeof atob === 'function') {
    const binary = atob(b64)
    try {
      return decodeURIComponent(
        Array.from(binary)
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      )
    } catch {
      return binary
    }
  }
  return Buffer.from(b64, 'base64').toString('utf8')
}

/**
 * Décode (sans vérifier la signature) un JWT de session pour l'UI.
 * La vraie vérification se fait côté API à chaque requête.
 */
export function decodeSession(token: string): SessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const json = JSON.parse(base64UrlDecode(parts[1]!))
    const parsed = SessionPayload.safeParse(json)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function isSessionExpired(payload: SessionPayload, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return payload.exp <= nowSeconds
}
