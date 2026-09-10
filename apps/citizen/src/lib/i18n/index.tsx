'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ItemKind } from '@/lib/contract'
import { ApiError } from '@/lib/contract'
import { de } from './de'
import { en } from './en'
import { fr } from './fr'
import { nl } from './nl'
import { LANGS, type Copy, type Lang } from './types'

export { LANGS, LANG_NAMES } from './types'
export type { Copy, Lang } from './types'

const DICTS: Record<Lang, Copy> = { fr, en, nl, de }

/**
 * La langue rendue côté serveur, et donc celle du premier HTML.
 *
 * Le français, parce que l'app est servie en France et que c'est la langue la
 * plus probable ; mais surtout parce que serveur et client doivent rendre la
 * même chose au premier passage, sans quoi React signale une divergence
 * d'hydratation et rejette tout l'arbre.
 */
const SSR_LANG: Lang = 'fr'
const STORAGE_KEY = 'sl-lang'

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/**
 * La langue à servir, dans l'ordre : ce que le vacancier a choisi ici, puis ce
 * que dit son téléphone, puis l'anglais.
 *
 * L'anglais et non le français comme dernier recours : quelqu'un dont le
 * téléphone est en espagnol ou en italien déchiffrera plus sûrement un écran en
 * anglais qu'en français, même debout dans un camping vendéen.
 */
function detect(): Lang {
  if (typeof window === 'undefined') return SSR_LANG
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLang(saved)) return saved
  } catch {
    /* navigation privée : on retombe sur la langue du navigateur */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.slice(0, 2).toLowerCase()
    if (isLang(base)) return base
  }
  return 'en'
}

/**
 * Pose `lang` sur <html> avant le premier rendu.
 *
 * Sans ça, un lecteur d'écran allemand lit un écran allemand avec une voix
 * française pendant tout le temps de l'hydratation. L'attribut est aussi ce qui
 * autorise le navigateur à proposer une traduction, ou à ne pas la proposer.
 */
export const langBootScript = `
(function () {
  try {
    var l = localStorage.getItem('${STORAGE_KEY}');
    if (!['${LANGS.join("','")}'].includes(l)) {
      var tags = navigator.languages || [navigator.language || 'fr'];
      l = 'en';
      for (var i = 0; i < tags.length; i++) {
        var b = String(tags[i]).slice(0, 2).toLowerCase();
        if (['${LANGS.join("','")}'].includes(b)) { l = b; break; }
      }
    }
    document.documentElement.lang = l;
  } catch (e) {}
})();
`

interface LangContext {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Copy
  /** Le nom d'un article, dans la langue courante. */
  itemLabel: (kind: ItemKind, apiLabel: string) => string
  /** Le message d'une erreur d'API, dans la langue courante. */
  errorText: (err: unknown) => string
}

const Ctx = createContext<LangContext | null>(null)

/* `useLayoutEffect` n'existe pas au rendu serveur ; côté client il s'exécute
 * avant la peinture, ce qui fait basculer la langue sans que le français
 * s'affiche une image. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(SSR_LANG)

  useIsoLayoutEffect(() => {
    const found = detect()
    if (found !== SSR_LANG) setLangState(found)
    document.documentElement.lang = found
  }, [])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    document.documentElement.lang = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* le choix ne survivra pas à la fermeture de l'onglet, tant pis */
    }
  }, [])

  const value = useMemo<LangContext>(() => {
    const t = DICTS[lang]
    return {
      lang,
      setLang,
      t,
      itemLabel: (kind, apiLabel) =>
        // En français, le libellé saisi par l'exploitant l'emporte : « Ballon de
        // foot taille 5 » dit plus que « Ballon ». Dans les autres langues il
        // n'est pas lisible, et le mot générique vaut mieux — le pictogramme
        // porte déjà la distinction entre les trois ballons.
        lang === 'fr' ? apiLabel : (t.items[kind] ?? apiLabel),
      errorText: (err) => {
        if (err instanceof ApiError) return t.errors[err.code] ?? t.errorFallback
        return t.errorFallback
      },
    }
  }, [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang(): LangContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLang doit être appelé sous <LangProvider>')
  return ctx
}
