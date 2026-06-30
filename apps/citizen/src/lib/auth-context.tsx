'use client'

import { onAuthStateChanged, type User } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { getFirebaseAuth } from './firebase'

/**
 * Contexte d'auth global — expose l'utilisateur Firebase courant et un flag
 * `loading` pour les premières millisecondes avant que le SDK ait lu la
 * persistence locale (cookie/IDB).
 */
type AuthState = {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
      setState({ user, loading: false })
    })
    return () => unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

/**
 * Hook utilitaire qui redirige vers /login si non connecté une fois le
 * loading terminé. À utiliser au top des écrans protégés.
 */
export function useRequireAuth(): User | null {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [loading, user, router])

  return user
}
