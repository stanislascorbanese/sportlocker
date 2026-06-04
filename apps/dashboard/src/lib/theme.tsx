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

/**
 * Provider de thème dashboard — copié de `apps/citizen/src/lib/theme.tsx`
 * avec quelques ajustements :
 *
 *   - Le dashboard démarre **toujours en dark** par défaut (le design legacy
 *     suppose un fond navy partout). Light mode est opt-in via le toggle.
 *   - Pas de meta theme-color à toucher (le dashboard n'est pas PWA).
 *
 * `system` reste disponible côté API mais le toggle UI ne propose que
 * dark/light pour simplifier.
 */
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'sl-dashboard-theme'

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
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage?.getItem(STORAGE_KEY) as ThemeMode | null
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored)
      }
    } catch {
      // mode privé Safari — on garde le défaut, plus de persistence
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mode !== 'system') return
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(resolveTheme('system'))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  useEffect(() => {
    if (!mounted) return
    applyTheme(resolveTheme(mode))
  }, [mode, mounted])

  const setMode = useCallback((m: ThemeMode) => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, m)
    } catch {
      // ignore — perte de persistence, pas de blocage du switch
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
