'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/**
 * Thème clair / sombre.
 *
 * Le clair est le défaut assumé : cette page s'ouvre devant une borne, dehors,
 * souvent en plein soleil de juillet. Le sombre reste disponible pour l'usage
 * de nuit et pour les vacanciers qui le préfèrent, et la préférence système est
 * respectée quand aucun choix n'a été fait.
 */

export type Theme = 'light' | 'dark'
const STORAGE_KEY = 'sl-theme'

interface ThemeValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeValue>({ theme: 'light', toggle: () => {} })

/** Script inliné dans <head> : évite le flash de thème avant l'hydratation. */
export const themeBootScript = `(function(){try{
var t=localStorage.getItem('${STORAGE_KEY}');
if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
if(t==='dark')document.documentElement.classList.add('dark');
document.documentElement.dataset.theme=t;
}catch(e){}})()`

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(readTheme())
  }, [])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      document.documentElement.dataset.theme = next
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* navigation privée : on garde le thème pour la session en cours */
      }
      return next
    })
  }, [])

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
