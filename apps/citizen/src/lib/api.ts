'use client'

import { z } from 'zod'

import { getFirebaseAuth } from './firebase'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

/**
 * Schémas Zod miroirs des DTO de services/api/src/routes/distributors.ts.
 * Dupliqués ici plutôt qu'importés du backend pour garder citizen/build
 * léger (pas de dépendance sur services/api).
 */
export const Distributor = z.object({
  id: z.string().uuid(),
  serialNumber: z.string(),
  name: z.string(),
  status: z.enum(['online', 'offline', 'maintenance', 'decommissioned']),
  communeId: z.string().uuid(),
  lockerCount: z.number().int().nonnegative(),
  idleLockers: z.number().int().nonnegative(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  addressLine: z.string().max(200).nullable(),
  batteryPercent: z.number().int().min(0).max(100).nullable(),
  lastSeenAt: z.string().datetime().nullable(),
})
export type Distributor = z.infer<typeof Distributor>

export const NearbyDistributor = Distributor.extend({
  distanceKm: z.number().min(0),
})
export type NearbyDistributor = z.infer<typeof NearbyDistributor>

export const LockerItemType = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  imageUrl: z.string().nullable(),
})
export type LockerItemType = z.infer<typeof LockerItemType>

export const DistributorDetail = Distributor.extend({
  lockers: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int(),
      state: z.enum(['idle', 'reserved', 'active', 'returning', 'fault']),
      currentItemId: z.string().uuid().nullable(),
      itemType: LockerItemType.nullable(),
    }),
  ),
})
export type DistributorDetail = z.infer<typeof DistributorDetail>
export type LockerDetail = DistributorDetail['lockers'][number]

export const ReservationActive = z.object({
  id: z.string().uuid(),
  status: z.enum(['scheduled', 'pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
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
})
export type ReservationActive = z.infer<typeof ReservationActive>

// ─── Modèle slots (PR 0008) ───────────────────────────────────────────────

export const SLOT_DURATIONS = [30, 60, 90, 120] as const
export type SlotDurationMinutes = typeof SLOT_DURATIONS[number]

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
 * Récupère le Firebase ID token courant si l'utilisateur est connecté.
 * `forceRefresh=false` pour éviter de rafraîchir à chaque requête (token
 * Firebase valable 1h, rafraîchi auto par le SDK avant expiration).
 */
async function authHeaders(): Promise<Record<string, string>> {
  const user = getFirebaseAuth().currentUser
  if (!user) return {}
  const idToken = await user.getIdToken(false)
  return { authorization: `Bearer ${idToken}` }
}

async function apiFetch<T>(
  path: string,
  schema: z.ZodSchema<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = {
    'content-type': 'application/json',
    ...(await authHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? `http_${res.status}`)
  }
  return schema.parse(await res.json())
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
 * Enregistre l'utilisateur Firebase courant côté API (idempotent côté backend).
 * À appeler après chaque signIn pour s'assurer qu'une ligne `users` existe.
 */
export async function registerCurrentUser(): Promise<void> {
  await apiFetch(
    `/v1/auth/register`,
    z.object({ id: z.string() }).passthrough(),
    { method: 'POST', body: '{}' },
  )
}

/**
 * Crée une réservation sur un casier disponible du distributeur, pour un
 * item-type donné. Le backend choisit le casier le moins ancien parmi les
 * idle qui contiennent un item du bon type.
 */
export async function createReservation(input: {
  distributorId: string
  itemTypeId: string
}): Promise<ReservationActive> {
  return apiFetch(`/v1/reservations`, ReservationActive, {
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
