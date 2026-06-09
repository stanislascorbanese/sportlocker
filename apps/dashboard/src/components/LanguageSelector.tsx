'use client'

import { useRouter } from 'next/navigation'

import { setClientLang, useLang } from '../lib/lang-client'
import { LANG_LABELS, SUPPORTED_LANGS, type Lang } from '../lib/lang'
import { cn } from '../lib/cn'
import { commonStrings } from '../lib/i18n/common'

/**
 * Boutons drapeau pour basculer la langue de l'interface.
 *
 * Deux étages de propagation :
 *  - `setClientLang(lang)` met à jour le DOM (`<html lang>`), pose le cookie
 *    `sportlocker-lang` et broadcast un évènement → re-render instantané de
 *    tous les composants client qui consomment `useLang()` (sidebar,
 *    PriceCell, MapClient…).
 *  - `router.refresh()` force Next.js à ré-exécuter les Server Components
 *    avec le nouveau cookie → re-render du HTML pour `/distributors`,
 *    `/communes`, etc. qui lisent la langue via `await getLang()` côté
 *    serveur. Sans ça, le HTML reste figé dans la langue précédente
 *    jusqu'au prochain reload manuel.
 */
export function LanguageSelector() {
  const current = useLang()
  const router = useRouter()
  const t = commonStrings(current)

  function onPick(lang: Lang) {
    if (lang === current) return
    setClientLang(lang)
    router.refresh()
  }

  return (
    <div
      role="radiogroup"
      aria-label={t.a11yLangSelector}
      className="flex items-center gap-1 rounded-md border p-1 border-gray-200 bg-gray-50 dark:border-white/5 dark:bg-white/[0.02]"
    >
      {SUPPORTED_LANGS.map((lang) => {
        const active = lang === current
        const { flag, native } = LANG_LABELS[lang]
        return (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(lang)}
            title={native}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-meta transition-colors duration-base',
              active
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'text-gray-500 hover:bg-gray-100 hover:text-navy-900 dark:text-white/55 dark:hover:bg-white/[0.04] dark:hover:text-white',
            )}
          >
            <span aria-hidden>{flag}</span>
            <span className="uppercase tracking-wide">{lang}</span>
          </button>
        )
      })}
    </div>
  )
}
