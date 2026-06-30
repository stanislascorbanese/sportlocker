'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'sl-theme'

/**
 * Lit la préférence stockée + système. Inline-safe (utilisée aussi par le
 * script anti-FOUC injecté dans `<head>`). Toute modif ici doit être
 * répliquée dans `applyInitialTheme()` côté layout.tsx pour rester en sync.
 */
function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  // Met à jour le meta theme-color pour la status bar PWA iOS/Android.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0D1B2A' : '#FFFFFF')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [mounted, setMounted] = useState(false)

  // Hydrate depuis localStorage au mount. Pour éviter le flash, le script
  // inline du <head> a déjà posé la classe `dark` ; on resync juste l'état
  // React ici.
  useEffect(() => {
    try {
      const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored)
      }
    } catch {
      // mode privé Safari : on garde le défaut 'dark', plus de persistence.
    }
    setMounted(true)
  }, [])

  // Écoute les changements de prefers-color-scheme système quand mode === 'system'.
  useEffect(() => {
    if (mode !== 'system') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(resolveTheme('system'))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  // Applique le thème à chaque changement de mode résolu.
  useEffect(() => {
    if (!mounted) return
    applyTheme(resolveTheme(mode))
  }, [mode, mounted])

  const setMode = useCallback((m: ThemeMode) => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, m)
    } catch {
      // ignore — perte de persistence, pas de blocage du switch.
    }
    setModeState(m)
  }, [])

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      try {
        window.localStorage?.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved: resolveTheme(mode),
      setMode,
      toggle,
    }),
    [mode, setMode, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>')
  }
  return ctx
}
