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
  status: z.enum(['pending', 'active', 'returned', 'overdue', 'cancelled', 'expired']),
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
