'use client'

import { setClientLang, useLang } from '../lib/lang-client'
import { LANG_LABELS, SUPPORTED_LANGS, type Lang } from '../lib/lang'
import { cn } from '../lib/cn'

/**
 * Boutons drapeau pour basculer la langue de l'interface.
 *
 * Couvre aujourd'hui la Sidebar (labels nav) et la carte (libellés statuts /
 * tuiles). Les autres pages restent en français tant qu'elles n'ont pas été
 * traduites — tracking : feat/dashboard-i18n.
 */
export function LanguageSelector() {
  const current = useLang()

  function onPick(lang: Lang) {
    if (lang === current) return
    setClientLang(lang)
  }

  return (
    <div
      role="radiogroup"
      aria-label="Langue de l'interface"
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
