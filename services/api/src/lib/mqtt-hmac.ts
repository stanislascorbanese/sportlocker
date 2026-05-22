/**
 * Vérification HMAC-SHA256 des events MQTT publiés par le firmware.
 *
 * Le firmware (services/firmware/src/sportlocker_firmware/locker_ctrl.py)
 * enveloppe chaque event signifiant dans :
 *
 *   { "data": { ... }, "sig": "<hex hmac-sha256>" }
 *
 * où `sig` = HMAC-SHA256(`JWT_DEVICE_SECRET`, canonical_json(data)) avec
 * `canonical_json` = `json.dumps(data, sort_keys=True, separators=(",", ":"))`.
 *
 * Le but : permettre au backend de détecter un message forgé si le canal
 * MQTT venait à fuir (broker compromis, sniffing TLS raté, etc.). Sans
 * cette vérif, n'importe qui avec un accès broker pourrait flipper des
 * réservations en `active` côté DB.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { env } from '../config/env.js'

export interface SignedEnvelope {
  data: Record<string, unknown>
  sig: string
}

/**
 * Produit le JSON canonique aligné sur le firmware Python :
 *   - clés triées
 *   - séparateurs ",", ":" (pas d'espaces)
 *   - types JSON standard uniquement (pas d'undefined/NaN)
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']'
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(obj[k])).join(',') + '}'
  }
  // undefined, function, symbol — pas attendus dans un payload MQTT JSON.
  throw new Error(`canonicalizeJson: unsupported type ${typeof value}`)
}

export function computeSignature(data: unknown, secret: string = env.JWT_DEVICE_SECRET): string {
  return createHmac('sha256', secret).update(canonicalizeJson(data)).digest('hex')
}

/**
 * Retourne `true` si `sig` correspond à HMAC-SHA256 du payload canonique.
 * Comparaison en temps constant pour éviter une oracle de timing.
 */
export function verifySignature(
  data: unknown,
  sig: string,
  secret: string = env.JWT_DEVICE_SECRET,
): boolean {
  const expected = computeSignature(data, secret)
  if (sig.length !== expected.length) return false
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * Parse une enveloppe MQTT signée. Retourne `null` si format invalide
 * (sans lancer pour ne pas crasher le handler MQTT sur un message bidon).
 */
export function parseSignedEnvelope(payload: unknown): SignedEnvelope | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  if (typeof obj.sig !== 'string' || !obj.data || typeof obj.data !== 'object') return null
  return { data: obj.data as Record<string, unknown>, sig: obj.sig }
}
