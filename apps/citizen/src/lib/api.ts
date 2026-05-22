'use client'

import { z } from 'zod'

import {
  Distributor,
  DistributorDetail,
  DistributorLocker,
  LockerItemType,
  NearbyDistributor,
} from '@sportlocker/types'

import { getFirebaseAuth } from './firebase'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export { Distributor, DistributorDetail, LockerItemType, NearbyDistributor }
export type LockerDetail = DistributorLocker

export const ReservationActive = z.object({
  id: z.string().uuid(),
  status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable().optional(),
  extensionCount: z.number().int().min(0),
  qrToken: z.string().min(20),
  distributor: z.object({
    id: z.string().uuid(),
    name: z.string(),
    addressLine: z.string().nullable().optional(),
  }),
  item: z.object({
    id: z.string().uuid(),
    typeName: z.string(),
  }),
  // Champs slot (PR 0008/0009) — null pour les résas legacy `pending`,
  // peuplés pour les `scheduled`.
  slotStartAt: z.string().datetime().nullable().optional(),
  slotEndAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().nullable().optional(),
  priceCents: z.number().int().nullable().optional(),
})
export type ReservationActive = z.infer<typeof ReservationActive>

/**
 * Annule une réservation `pending` ou `scheduled`. Pour `scheduled`,
 * l'API refuse 409 `too_late_to_cancel` si on est à moins de 30 min du début
 * du slot.
 */
export async function cancelReservation(id: string): Promise<void> {
  await apiFetch(
    `/v1/reservations/${id}/cancel`,
    z.object({ ok: z.literal(true) }),
    { method: 'POST', body: '{}' },
  )
}

/**
 * Prolonge une réservation `active` (emprunt en cours). L'API ajoute
 * `item_types.max_duration_minutes` au `dueAt`. Max `MAX_EXTENSIONS` (2)
 * prolongations par résa — au-delà, 409 `max_extensions_reached`. Refuse
 * aussi si status ≠ 'active' (409 `reservation_not_extendable`) ou si
 * un autre user a déjà claim le casier (409 `locker_conflict`).
 */
export const MAX_EXTENSIONS = 2

export async function extendReservation(id: string): Promise<void> {
  await apiFetch(
    `/v1/reservations/${id}/extend`,
    // L'API retourne ReservationBaseDTO (non enrichi) — on ignore le body
    // de réponse, le caller invalide la query `reservation-active` pour
    // récupérer le shape complet via GET /active.
    z.object({}).passthrough(),
    { method: 'PATCH', body: '{}' },
  )
}

// ─── Modèle slots (PR 0008) + forfait journée (PR 0009) ───────────────────

export const DAY_PASS_MINUTES = 1440 as const

export const SLOT_DURATIONS = [30, 60, 90, 120, 1440] as const
export type SlotDurationMinutes = typeof SLOT_DURATIONS[number]

export function isDayPassDuration(d: number): boolean {
  return d === DAY_PASS_MINUTES
}

export const AvailabilitySlot = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  durationMinutes: z.number().int(),
  available: z.boolean(),
  priceCents: z.number().int().nonnegative().nullable(),
})
export type AvailabilitySlot = z.infer<typeof AvailabilitySlot>

export const AvailabilityResponse = z.object({
  distributorId: z.string().uuid(),
  itemTypeId: z.string().uuid(),
  durationMinutes: z.number().int(),
  days: z.record(z.string(), z.array(AvailabilitySlot)),
})
export type AvailabilityResponse = z.infer<typeof AvailabilityResponse>

/**
 * Schéma de la réponse POST /v1/reservations/slots (DTO étendu).
 * Le shape inclut les colonnes slot et le deviceToken (JWT QR).
 */
export const SlotReservationCreated = z.object({
  id: z.string().uuid(),
  status: z.literal('scheduled'),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  extensionCount: z.number().int(),
  slotStartAt: z.string().datetime(),
  slotEndAt: z.string().datetime(),
  durationMinutes: z.number().int(),
  priceCents: z.number().int().nonnegative(),
  nonce: z.string().uuid(),
  deviceToken: z.string(),
})
export type SlotReservationCreated = z.infer<typeof SlotReservationCreated>

/**
 * Erreur API typée — porte le code HTTP et le code d'erreur métier
 * (champ `error` du body JSON renvoyé par Fastify).
 */
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(`API ${status}: ${code}`)
  }
}

/**
 * Token de session SportLocker (JWT HS256 signé par l'API avec
 * JWT_SESSION_SECRET, TTL 7 jours). Échangé contre le Firebase ID token
 * via `POST /v1/auth/register` au login et stocké dans localStorage pour
 * persister entre reloads de la PWA.
 *
 * IMPORTANT : l'API n'accepte PAS le Firebase ID token directement —
 * elle vérifie systématiquement sa propre session JWT. D'où le besoin
 * d'échange explicite (cf. registerCurrentUser).
 */
const SESSION_TOKEN_KEY = 'sportlocker_session_token'

function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SESSION_TOKEN_KEY)
  } catch {
    return null
  }
}

function setStoredSessionToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token)
  } catch {
    // localStorage peut throw en private mode Safari — pas critique,
    // la session sera juste perdue au reload.
  }
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY)
  } catch {
    /* idem */
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getStoredSessionToken()
  if (!token) return {}
  return { authorization: `Bearer ${token}` }
}

async function apiFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init: RequestInit = {},
  // Pour éviter une boucle infinie register → register en cas de bug serveur,
  // on coupe la retry au 2e essai.
  isRetry = false,
): Promise<T> {
  const headers = {
    'content-type': 'application/json',
    ...(await authHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  // 401 = session expirée ou jamais établie → on tente un re-register à
  // partir du Firebase user courant, puis retry de la requête originale.
  if (res.status === 401 && !isRetry && path !== '/v1/auth/register') {
    const refreshed = await tryRefreshSession()
    if (refreshed) {
      return apiFetch(path, schema, init, true)
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? `http_${res.status}`)
  }
  return schema.parse(await res.json())
}

/**
 * Tente un re-register silencieux : récupère le Firebase ID token courant
 * (fresh, forceRefresh=true pour éliminer un Firebase token expiré au passage)
 * et l'échange contre une nouvelle session. Retourne true si la session a
 * été rafraîchie avec succès.
 */
async function tryRefreshSession(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser
  if (!user) {
    clearSessionToken()
    return false
  }
  try {
    const idToken = await user.getIdToken(true)
    await registerCurrentUser(idToken)
    return true
  } catch {
    clearSessionToken()
    return false
  }
}

// ─── Endpoints citoyens ───────────────────────────────────────────────

export async function fetchNearbyDistributors(
  lat: number,
  lng: number,
  radiusKm = 5,
): Promise<NearbyDistributor[]> {
  const data = await apiFetch(
    `/v1/distributors/nearby?lat=${lat}&lng=${lng}&radius_km=${radiusKm}`,
    z.object({ items: z.array(NearbyDistributor) }),
  )
  return data.items
}

/**
 * Liste complète du parc (limite 200 côté API). Utilisé par la carte
 * accueil : on veut TOUS les distributeurs visibles, l'utilisateur navigue
 * lui-même. La distance est calculée client-side une fois la géoloc obtenue.
 */
export async function fetchAllDistributors(): Promise<Distributor[]> {
  const data = await apiFetch(
    `/v1/distributors`,
    z.object({ items: z.array(Distributor) }),
  )
  return data.items
}

export async function fetchDistributorDetail(id: string): Promise<DistributorDetail> {
  return apiFetch(`/v1/distributors/${id}`, DistributorDetail)
}

/**
 * Échange un Firebase ID token contre une session SportLocker (JWT HS256,
 * TTL 7 jours) et stocke le sessionToken dans localStorage. Upsert idempotent
 * de la row `users` côté backend.
 *
 * À appeler :
 *   - après chaque signIn (la session précédente peut être périmée)
 *   - automatiquement par `apiFetch` sur une 401 (cf. tryRefreshSession)
 *
 * Si `idToken` est omis, on récupère le token Firebase du user courant.
 */
export async function registerCurrentUser(idToken?: string): Promise<void> {
  let token = idToken
  if (!token) {
    const user = getFirebaseAuth().currentUser
    if (!user) throw new ApiError(401, 'no_firebase_user')
    token = await user.getIdToken(false)
  }

  const RegisterResponse = z.object({
    sessionToken: z.string(),
    user: z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      displayName: z.string().nullable(),
      role: z.enum(['citizen', 'operator', 'admin', 'super_admin']),
    }).passthrough(),
  })

  // Bypass de `apiFetch` ici : pas d'authHeaders à envoyer (on n'en a pas
  // encore !) et pas de retry sur 401 (la 401 est terminale pour /register).
  const res = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? `http_${res.status}`)
  }
  const data = RegisterResponse.parse(await res.json())
  setStoredSessionToken(data.sessionToken)
}

/**
 * Réponse de `POST /v1/reservations` — shape "base + nonce + deviceToken",
 * différent du shape enrichi de `GET /v1/reservations/active`. Pas de
 * `distributor.name` / `item.typeName` ici ; le caller redirige vers
 * /reservations/<id> qui fait un GET /active enrichi pour le rendu.
 */
export const ReservationCreated = z.object({
  id: z.string().uuid(),
  status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  lockerId: z.string().uuid(),
  itemId: z.string().uuid(),
  distributorId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  dueAt: z.string().datetime().nullable(),
  extensionCount: z.number().int(),
  nonce: z.string().uuid(),
  deviceToken: z.string(),
})
export type ReservationCreated = z.infer<typeof ReservationCreated>

/**
 * Crée une réservation IMMÉDIATE (status `pending`, TTL 15 min) sur un
 * casier ciblé. Contrat API : `{ lockerId, itemId, communeId }`. Le caller
 * doit choisir le casier en amont (cf. distributor detail page).
 *
 * Différent de `createSlotReservation` (qui crée du `scheduled`). Utilisé
 * quand l'utilisateur est physiquement au distributeur et veut emprunter
 * dans la minute.
 */
export async function createReservation(input: {
  lockerId: string
  itemId: string
  communeId: string
}): Promise<ReservationCreated> {
  return apiFetch(`/v1/reservations`, ReservationCreated, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function fetchActiveReservation(): Promise<ReservationActive | null> {
  try {
    return await apiFetch(`/v1/reservations/active`, ReservationActive)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

/**
 * Récupère la grille de slots disponibles sur J→J+7 pour un sport et une durée
 * donnée. Route publique (pas besoin d'être loggué pour regarder les dispos).
 */
export async function fetchAvailability(input: {
  distributorId: string
  itemTypeId: string
  durationMinutes: SlotDurationMinutes
  from?: string
  to?: string
}): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    itemTypeId: input.itemTypeId,
    durationMinutes: String(input.durationMinutes),
  })
  if (input.from) params.set('from', input.from)
  if (input.to) params.set('to', input.to)
  return apiFetch(
    `/v1/distributors/${input.distributorId}/availability?${params.toString()}`,
    AvailabilityResponse,
  )
}

/**
 * Crée une réservation `scheduled` pour un créneau précis. L'API choisit
 * l'item dispo et fige le prix d'affichage (snapshot anti-modification).
 */
export async function createSlotReservation(input: {
  distributorId: string
  itemTypeId: string
  slotStartAt: string
  durationMinutes: SlotDurationMinutes
}): Promise<SlotReservationCreated> {
  return apiFetch(`/v1/reservations/slots`, SlotReservationCreated, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ─── Web Push subscriptions (PR 0010) ─────────────────────────────────────

export const PushConfig = z.object({
  vapidPublicKey: z.string().nullable(),
})
export type PushConfig = z.infer<typeof PushConfig>

/**
 * Récupère la clé publique VAPID nécessaire à `pushManager.subscribe()`.
 * Route publique, pas d'auth requise. Retourne `vapidPublicKey: null` si
 * l'API n'a pas de clés VAPID configurées (l'opérateur n'a pas tourné
 * `npx web-push generate-vapid-keys` puis set les Variables Railway).
 */
export async function fetchPushConfig(): Promise<PushConfig> {
  // Route publique → fetch direct sans apiFetch (pas d'auth header,
  // pas de retry session sur 401).
  const res = await fetch(`${API_URL}/v1/push-subscriptions/config`)
  if (!res.ok) throw new ApiError(res.status, `http_${res.status}`)
  return PushConfig.parse(await res.json())
}

const PushSubscriptionDTO = z.object({
  id: z.string().uuid(),
  endpoint: z.string().url(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime(),
})

/** Enregistre la subscription côté backend (idempotent ON CONFLICT endpoint). */
export async function registerPushSubscription(input: {
  endpoint: string
  keys: { p256dh: string; auth: string }
  deviceInfo?: Record<string, unknown>
  /** Délai en minutes avant `slot_start_at` pour le rappel. UI propose 15/30/60/120. */
  reminderMinutesBefore?: number
}): Promise<z.infer<typeof PushSubscriptionDTO>> {
  return apiFetch(`/v1/push-subscriptions`, PushSubscriptionDTO, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Désinscrit la subscription identifiée par son endpoint. Idempotent. */
export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  await apiFetch(
    `/v1/push-subscriptions`,
    z.object({ ok: z.literal(true) }),
    { method: 'DELETE', body: JSON.stringify({ endpoint }) },
  )
}

/** Lit la préférence "X minutes avant" du user courant. */
export async function fetchReminderPreferences(): Promise<{ reminderMinutesBefore: number }> {
  return apiFetch(
    `/v1/push-subscriptions/preferences`,
    z.object({ reminderMinutesBefore: z.number().int() }),
  )
}
