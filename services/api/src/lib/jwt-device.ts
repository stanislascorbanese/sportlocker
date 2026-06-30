import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { randomBytes } from 'node:crypto'

import { env } from '../config/env.js'

/**
 * JWT HS256 du QR code — signé par l'API (côté backend) ou par l'app mobile
 * en mode offline. Le firmware vérifie sans Internet (clé partagée).
 *
 * Durée de validité : 15 min. `jti` = nonce anti-replay (cf. table token_nonces).
 */

const SECRET = new TextEncoder().encode(env.JWT_DEVICE_SECRET)
const ISSUER = 'sportlocker.app'
const AUDIENCE = 'sportlocker.device'

export interface DeviceTokenClaims extends JWTPayload {
  reservationId: string
  lockerId: string
  distributorId: string
  /**
   * Pour les résas du modèle slots (PR 0008), epoch seconds du début du
   * créneau. Le firmware refuse l'ouverture si `now < slotStartAt` (à
   * une tolérance d'horloge près), évitant qu'un user scanne avant son
   * créneau. Absent pour les résas legacy "immédiat" (POST /reservations).
   */
  slotStartAt?: number
}

export async function signDeviceToken(
  claims: DeviceTokenClaims,
  ttlSec = 900,
  explicitJti?: string,
): Promise<string> {
  const jti = explicitJti ?? randomBytes(16).toString('hex')
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSec}s`)
    .setJti(jti)
    .sign(SECRET)
}

export async function verifyDeviceToken(token: string): Promise<DeviceTokenClaims & { jti: string }> {
  const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER, audience: AUDIENCE })
  if (!payload.jti) throw new Error('missing_jti')
  return payload as DeviceTokenClaims & { jti: string }
}
