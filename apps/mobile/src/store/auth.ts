import { create } from 'zustand'

interface AuthUser {
  id: string
  email: string
  trustScore: number
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  setSession: (user: AuthUser, token: string) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setSession: (user, token) => set({ user, token }),
  signOut: () => set({ user: null, token: null }),
}))
