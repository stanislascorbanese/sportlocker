'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { setLangAction } from '../app/_actions/lang'
import { LANG_LABELS, SUPPORTED_LANGS, type Lang } from '../lib/lang'
import { cn } from '../lib/cn'

/**
 * Boutons drapeau pour basculer la langue de l'interface. Aujourd'hui ça
 * affecte les libellés de la carte ; les autres pages restent en français
 * tant qu'elles n'ont pas été traduites.
 */
export function LanguageSelector({ current }: { current: Lang }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onPick(lang: Lang) {
    if (lang === current || pending) return
    startTransition(async () => {
      await setLangAction(lang)
      router.refresh()
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label="Langue de l'interface"
      className="flex items-center gap-1 rounded-md border border-white/5 bg-white/[0.02] p-1"
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
            disabled={pending}
            onClick={() => onPick(lang)}
            title={native}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] transition disabled:opacity-50',
              active
                ? 'bg-emerald-500/15 text-emerald-200'
                : 'text-white/55 hover:bg-white/[0.04] hover:text-white',
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
