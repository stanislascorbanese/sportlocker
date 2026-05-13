import Constants from 'expo-constants'
import auth from '@react-native-firebase/auth'

import { useAuthStore } from '../store/auth'

const BASE_URL = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://localhost:3000'

/**
 * Single-flight refresh : si un refresh est déjà en cours, les autres appels
 * partagent la même promise plutôt que d'en relancer un en parallèle (qui
 * invaliderait le sessionToken du premier).
 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshSessionFromFirebase(): Promise<string | null> {
  try {
    const firebaseUser = auth().currentUser
    if (!firebaseUser) return null

    const idToken = await firebaseUser.getIdToken(true)
    const res = await fetch(`${BASE_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    })
    if (!res.ok) return null

    const data = (await res.json()) as {
      sessionToken: string
      user: { id: string; email: string; trustScore: number }
    }
    useAuthStore.getState().setSession(
      { id: data.user.id, email: data.user.email, trustScore: data.user.trustScore },
      data.sessionToken,
    )
    return data.sessionToken
  } catch {
    return null
  }
}

function getOrStartRefresh(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshSessionFromFirebase().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function rawFetch<T>(path: string, init: RequestInit, token: string | null): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
}

/**
 * Fetch authentifié avec gestion du 401 : tente un refresh Firebase
 * + ré-échange via /v1/auth/register, puis rejoue la requête une fois.
 * Si le refresh échoue, on signOut() et on remonte l'erreur 401.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const initialToken = useAuthStore.getState().token

  let res = await rawFetch<T>(path, init, initialToken)
  if (res.status === 401) {
    const refreshed = await getOrStartRefresh()
    if (refreshed) {
      res = await rawFetch<T>(path, init, refreshed)
    } else {
      useAuthStore.getState().signOut()
    }
  }
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`)
  return res.json() as Promise<T>
}
