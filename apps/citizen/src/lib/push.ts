'use client'

import {
  fetchPushConfig,
  registerPushSubscription,
  unregisterPushSubscription,
} from './api'

/**
 * Helpers Web Push côté client (PR 0010).
 *
 * Flow nominal :
 *   1. Détecter le support (Service Worker + PushManager + Notification API)
 *   2. Récupérer la clé publique VAPID du backend
 *   3. Demander la permission `Notification.requestPermission()`
 *   4. `serviceWorker.register('/sw.js')` puis `pushManager.subscribe()`
 *      avec `applicationServerKey: <VAPID public en Uint8Array>`
 *   5. POST la PushSubscription à `/v1/push-subscriptions`
 *
 * Désinscription :
 *   - `pushManager.getSubscription()` → `subscription.unsubscribe()`
 *   - DELETE /v1/push-subscriptions avec l'endpoint
 */

export type PushSupportStatus = 'supported' | 'unsupported' | 'insecure-context'
export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

/**
 * Vérifie la disponibilité de Web Push. Cas typiques d'indisponibilité :
 *   - Safari < 16, vieux Chrome
 *   - Contexte non sécurisé (http://, pas localhost)
 *   - PWA installée en mode standalone sur iOS < 16.4
 */
export function detectPushSupport(): PushSupportStatus {
  if (typeof window === 'undefined') return 'unsupported'
  if (!('serviceWorker' in navigator)) return 'unsupported'
  if (!('PushManager' in window)) return 'unsupported'
  if (!('Notification' in window)) return 'unsupported'
  // Service workers exigent un secure context (https ou localhost).
  if (!window.isSecureContext) return 'insecure-context'
  return 'supported'
}

export function currentPermission(): PushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PushPermission
}

/**
 * Convertit une clé VAPID base64url en `Uint8Array` (format attendu par
 * `pushManager.subscribe({ applicationServerKey })`).
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/**
 * Récupère la subscription active du browser si elle existe (le user a
 * déjà cliqué "Activer" avant). Permet à l'UI d'afficher "Activé" sans
 * relancer un flow de subscription.
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (detectPushSupport() !== 'supported') return null
  try {
    const reg = await navigator.serviceWorker.ready
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export type SubscribeResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'unsupported' | 'permission_denied' | 'vapid_missing' | 'subscribe_failed' | 'register_failed'; detail?: string }

/**
 * Flow complet d'inscription. Idempotent : si une subscription existe déjà
 * pour ce browser, on la réutilise (et on re-POST au backend pour mettre à
 * jour lastUsedAt côté DB).
 */
export async function subscribePush(): Promise<SubscribeResult> {
  if (detectPushSupport() !== 'supported') {
    return { ok: false, reason: 'unsupported' }
  }

  // 1. Permission utilisateur
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') {
    return { ok: false, reason: 'permission_denied', detail: perm }
  }

  // 2. VAPID public key depuis backend
  const config = await fetchPushConfig().catch(() => ({ vapidPublicKey: null }))
  if (!config.vapidPublicKey) {
    return { ok: false, reason: 'vapid_missing' }
  }

  // 3. Service worker
  let registration: ServiceWorkerRegistration
  try {
    registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
  } catch (err) {
    return {
      ok: false,
      reason: 'subscribe_failed',
      detail: err instanceof Error ? err.message : 'sw_register_failed',
    }
  }

  // 4. Subscribe (réutilise la sub existante si déjà set)
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast nécessaire : TS 5.6+ typage strict `Uint8Array<ArrayBufferLike>`
        // n'est pas assignable à `BufferSource` qui attend un ArrayBuffer
        // concret. Le runtime accepte sans souci.
        applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) as BufferSource,
      })
    } catch (err) {
      return {
        ok: false,
        reason: 'subscribe_failed',
        detail: err instanceof Error ? err.message : 'subscribe_failed',
      }
    }
  }

  // 5. Push au backend. Le payload `keys` est sous-forme ArrayBuffer dans
  //    l'objet PushSubscription — on convertit en base64url string que le
  //    backend stocke directement.
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: 'subscribe_failed', detail: 'malformed_subscription' }
  }

  try {
    await registerPushSubscription({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      deviceInfo: {
        userAgent: navigator.userAgent,
        language: navigator.language,
      },
    })
  } catch (err) {
    return {
      ok: false,
      reason: 'register_failed',
      detail: err instanceof Error ? err.message : 'register_failed',
    }
  }

  return { ok: true, endpoint: json.endpoint }
}

/**
 * Désinscription : retire la subscription côté browser ET côté backend.
 * Robuste : si l'une des étapes échoue, on continue avec l'autre.
 */
export async function unsubscribePush(): Promise<void> {
  if (detectPushSupport() !== 'supported') return
  const sub = await getCurrentSubscription()
  if (!sub) return

  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await unregisterPushSubscription(endpoint).catch(() => undefined)
}
