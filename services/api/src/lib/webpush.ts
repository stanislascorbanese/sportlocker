/**
 * Wrapper Web Push (RFC 8030 + VAPID) pour notifs côté citoyen.
 *
 * On utilise `web-push` (npm) qui gère :
 *   - encryption ECDH du payload avec p256dh + auth de chaque subscription
 *   - signature VAPID JWS (clé privée API) pour s'identifier auprès du
 *     push service (FCM / Mozilla / Apple)
 *   - HTTP POST sur l'`endpoint` retourné par le browser à `subscribe()`
 *
 * Si `VAPID_PUBLIC_KEY` ou `VAPID_PRIVATE_KEY` sont absents de l'env,
 * `send()` retourne `{ ok: false, reason: 'not_configured' }` sans throw.
 * Le caller (route ou cron) logge en warn et continue — l'API ne doit pas
 * crash juste parce qu'un opérateur a oublié de générer les clés VAPID.
 */
import webpush from 'web-push'

import { env } from '../config/env.js'

export type PushSubscriptionInput = {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export type PushPayload = {
  /** Titre affiché dans la notif (max ~60 chars selon OS). */
  title: string
  /** Corps de la notif (max ~120 chars). */
  body: string
  /** URL à ouvrir au click (peut être relative à l'origin du SW). */
  url?: string
  /** Image badge (icône). */
  icon?: string
  /** Identifiant pour dédupliquer côté browser (replace = même tag). */
  tag?: string
}

export type SendResult =
  | { ok: true; statusCode: number }
  | { ok: false; reason: 'not_configured' | 'gone' | 'invalid' | 'http_error'; statusCode?: number; detail?: string }

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
  return true
}

/**
 * Envoie une notif à UNE subscription. Logique d'erreur :
 *   - 404 / 410 du push service = subscription révoquée (le browser a
 *     désabonné le user). Caller doit supprimer la row en DB.
 *   - 400 / 401 / 403 = clé VAPID invalide ou payload mal formé.
 *   - 5xx ou network = retry possible (caller décide).
 */
export async function sendWebPush(
  subscription: PushSubscriptionInput,
  payload: PushPayload,
): Promise<SendResult> {
  if (!ensureConfigured()) {
    return { ok: false, reason: 'not_configured' }
  }
  try {
    const res = await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      // 24h TTL : si le device est offline plus longtemps, le push service
      // jette la notif. Les rappels de slot sont sensibles au temps (H-1),
      // pas la peine de stocker plus longtemps côté push service.
      { TTL: 24 * 60 * 60 },
    )
    return { ok: true, statusCode: res.statusCode }
  } catch (err) {
    // `web-push` jette une erreur avec `statusCode` et `body` pour les
    // réponses HTTP non-2xx du push service.
    const e = err as { statusCode?: number; body?: string; message?: string }
    if (e.statusCode === 404 || e.statusCode === 410) {
      return {
        ok: false, reason: 'gone', statusCode: e.statusCode,
        ...(e.body ? { detail: e.body } : {}),
      }
    }
    if (e.statusCode === 400 || e.statusCode === 401 || e.statusCode === 403) {
      return {
        ok: false, reason: 'invalid', statusCode: e.statusCode,
        ...(e.body ? { detail: e.body } : {}),
      }
    }
    return {
      ok: false,
      reason: 'http_error',
      ...(typeof e.statusCode === 'number' ? { statusCode: e.statusCode } : {}),
      ...(e.body || e.message ? { detail: e.body ?? e.message } : {}),
    }
  }
}
