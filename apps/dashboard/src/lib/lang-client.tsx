'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { isLang, type Lang } from './lang'

/**
 * Système de langue côté client : Context React + event custom pour propager
 * un changement de langue à tous les composants sans round-trip serveur.
 *
 * Pipeline :
 *  1. RootLayout (Server) lit le cookie → passe `initial` à <LangProvider>
 *  2. LanguageSelector appelle setClientLang(lang) au clic
 *  3. setClientLang :
 *     - met à jour `<html lang>` (pour CSS / a11y)
 *     - écrit le cookie (persistance SSR future)
 *     - dispatch un évènement custom
 *  4. LangProvider écoute l'évènement → Context update → tous les useLang()
 *     re-render avec la nouvelle valeur (< 50 ms).
 */

export const LANG_CHANGE_EVENT = 'sportlocker-langchange'
export const LANG_COOKIE = 'sportlocker-lang'

const LangContext = createContext<Lang>('fr')

export function LangProvider({
  initial,
  children,
}: {
  initial: Lang
  children: ReactNode
}) {
  const [lang, setLang] = useState<Lang>(initial)

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<Lang>).detail
      if (isLang(detail)) setLang(detail)
    }
    window.addEventListener(LANG_CHANGE_EVENT, onChange)
    return () => window.removeEventListener(LANG_CHANGE_EVENT, onChange)
  }, [])

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  return useContext(LangContext)
}

/**
 * Bascule la langue côté client : DOM + cookie + event broadcast.
 * No-op côté serveur (document indisponible).
 */
export function setClientLang(lang: Lang): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
  window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: lang }))
}
