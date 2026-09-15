'use client'

import { useState } from 'react'

import { LANGS, LANG_NAMES, useLang } from '@/lib/i18n'
import { cn } from '@/lib/cn'

/**
 * Le choix de la langue, en quatre pastilles visibles d'emblée.
 *
 * Pas de menu déroulant, pas de drapeaux. Un menu suppose qu'on aille le
 * chercher, et un Néerlandais devant une borne ne cherchera pas : il faut qu'il
 * voie « NL » dans la première seconde, sinon il repart à l'accueil. Et les
 * drapeaux désignent des pays, pas des langues — un Belge ou un Autrichien n'y
 * retrouve pas la sienne.
 *
 * La langue est déjà présélectionnée d'après le téléphone ; ces pastilles ne
 * servent qu'à corriger, ce qui justifie qu'elles restent discrètes.
 *
 * Elles se replient dès qu'on en a choisi une. Les quatre côte à côte mangeaient
 * la moitié de l'en-tête et tronquaient le nom de la borne — or ce nom est ce
 * que le vacancier vient vérifier. Après un choix, seule la langue active reste,
 * et un appui la redéploie : on rend la place sans jamais piéger quelqu'un dans
 * une langue qu'il ne lit pas.
 */
export function LangPicker() {
  const { lang, setLang, t } = useLang()
  const [choisi, setChoisi] = useState(false)
  const replie = choisi

  if (replie) {
    return (
      <button
        type="button"
        onClick={() => setChoisi(false)}
        aria-label={t.langPicker}
        title={t.langPicker}
        lang={lang}
        className="grid h-11 min-w-[2.75rem] shrink-0 place-items-center rounded-full bg-surface-2 px-2 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-muted transition-colors duration-base hover:text-ink"
      >
        {lang}
        <span className="sr-only"> — {LANG_NAMES[lang]}</span>
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={t.langPicker}
      className="flex shrink-0 items-center rounded-full bg-surface-2 p-0.5"
    >
      {LANGS.map((code) => {
        const active = code === lang
        return (
          <button
            key={code}
            type="button"
            onClick={() => {
              setLang(code)
              setChoisi(true)
            }}
            lang={code}
            aria-pressed={active}
            title={LANG_NAMES[code]}
            className={cn(
              'grid h-9 min-w-[1.875rem] place-items-center rounded-full px-1',
              'text-[0.8125rem] font-bold uppercase tracking-wide',
              'transition-colors duration-base',
              active
                ? 'bg-brand text-brand-on'
                : 'text-ink-muted hover:bg-surface hover:text-ink',
            )}
          >
            {code}
            <span className="sr-only"> — {LANG_NAMES[code]}</span>
          </button>
        )
      })}
    </div>
  )
}
