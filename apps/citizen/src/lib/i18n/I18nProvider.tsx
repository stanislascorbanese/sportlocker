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

import { type Locale, type MessageKey, messages, SUPPORTED_LOCALES } from './messages'

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

const STORAGE_KEY = 'sl-locale'

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'fr'
  // try/catch + optional chaining : Safari mode privé throw sur l'accès au
  // storage ; certains environnements de test n'instancient pas window.localStorage
  // → on dégrade gracieusement plutôt que de crasher.
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'fr' || stored === 'en') return stored
  } catch {
    // ignore
  }
  const lang = window.navigator?.language?.toLowerCase() ?? ''
  if (lang.startsWith('en')) return 'en'
  return 'fr'
}

/**
 * Provider i18n minimaliste basé sur React Context — pas de routing
 * /fr|/en (on garde une seule entrée PWA app.sportlocker.fr et l'auth
 * Firebase qui suppose une URL stable).
 *
 * Templating : `{name}` dans le message est remplacé par `vars.name`.
 * Pas de pluralisation ICU — utiliser des clés `_one` / `_many` quand
 * deux formes sont nécessaires (cf. `home.count_one` / `home.count_many`).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  // Rendu serveur = FR par défaut. Le useEffect ci-dessous resync avec
  // localStorage / navigator.language au mount (mineur flash possible si
  // l'utilisateur a stocké EN).
  const [locale, setLocaleState] = useState<Locale>('fr')

  useEffect(() => {
    setLocaleState(detectInitialLocale())
  }, [])

  const setLocale = useCallback((l: Locale) => {
    if (!SUPPORTED_LOCALES.includes(l)) return
    try {
      window.localStorage?.setItem(STORAGE_KEY, l)
    } catch {
      // mode privé Safari : on perd la persistence, mais on n'empêche pas
      // le switch en session.
    }
    setLocaleState(l)
    // Met à jour l'attribut lang sur <html> pour les screen readers + a11y.
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l
    }
  }, [])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      const raw = messages[locale]?.[key] ?? messages.fr[key] ?? String(key)
      if (!vars) return raw
      return Object.entries(vars).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        raw,
      )
    },
    [locale],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used inside <I18nProvider>')
  }
  return ctx
}

/** Raccourci : `const t = useT()` puis `t('home.title')`. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t
}
