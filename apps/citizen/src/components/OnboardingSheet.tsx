'use client'

import { Calendar, type LucideIcon, MapPin, QrCode } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useT } from '../lib/i18n/I18nProvider'
import type { MessageKey } from '../lib/i18n/messages'
import { Button } from './ui/Button'
import { Sheet } from './ui/Sheet'

/**
 * Tour guidé 3 étapes au premier home visit. Show une fois max par
 * appareil (flag `sl-onboarding-seen` en localStorage). L'utilisateur peut
 * passer à tout moment (X du Sheet, bouton "Passer", ou Escape).
 *
 * Pas de coachmark sur les vrais éléments DOM (anchor positioning est encore
 * fragile sur Safari, et les éléments cibles bougent quand la map se
 * recentre) — on opte pour un Sheet centré + illustrations cohérentes.
 *
 * Pour ré-afficher manuellement : `localStorage.removeItem('sl-onboarding-seen')`
 * (commande à exposer dans /profile dans un futur lot si besoin).
 */
const STORAGE_KEY = 'sl-onboarding-seen'

type StepTone = 'emerald' | 'sky' | 'amber'

type Step = {
  icon: LucideIcon
  titleKey: MessageKey
  descriptionKey: MessageKey
  tone: StepTone
}

const STEPS: Step[] = [
  {
    icon: MapPin,
    titleKey: 'onboarding.step1.title',
    descriptionKey: 'onboarding.step1.description',
    tone: 'emerald',
  },
  {
    icon: Calendar,
    titleKey: 'onboarding.step2.title',
    descriptionKey: 'onboarding.step2.description',
    tone: 'sky',
  },
  {
    icon: QrCode,
    titleKey: 'onboarding.step3.title',
    descriptionKey: 'onboarding.step3.description',
    tone: 'emerald',
  },
]

const TONE_CLASSES: Record<StepTone, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

export function OnboardingSheet() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)

  // Trigger : montre le sheet au premier mount si pas encore vu. Effectué
  // dans useEffect (et pas via useState init) pour éviter le mismatch SSR :
  // côté serveur on ne sait pas ce que localStorage contient → on rend
  // toujours `open=false`, puis on resync au client.
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY)
      if (!seen) setOpen(true)
    } catch {
      // localStorage indispo (mode privé Safari très restrictif) → on ne
      // montre pas l'onboarding plutôt que de risquer un crash.
    }
  }, [])

  function markSeen() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // idem
    }
  }

  function dismiss() {
    markSeen()
    setOpen(false)
    // Reset l'étape pour que si l'onboarding est ré-déclenché manuellement
    // plus tard, il reparte du début.
    setStepIdx(0)
  }

  function next() {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1)
    } else {
      dismiss()
    }
  }

  const step = STEPS[stepIdx]
  if (!step) return null
  const Icon = step.icon
  const isLast = stepIdx === STEPS.length - 1
  const totalSteps = STEPS.length

  return (
    <Sheet open={open} onClose={dismiss} title={t('onboarding.welcome')} maxHeight={70}>
      <div className="flex flex-col items-center gap-5 pb-2 pt-2 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors duration-base ${TONE_CLASSES[step.tone]}`}
        >
          <Icon className="h-8 w-8" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-navy-900 dark:text-white">
            {t(step.titleKey)}
          </h2>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-white/65">
            {t(step.descriptionKey)}
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-base ease-out-soft ${
                i === stepIdx
                  ? 'w-6 bg-emerald-500 dark:bg-emerald-400'
                  : 'w-1.5 bg-gray-300 dark:bg-white/20'
              }`}
            />
          ))}
        </div>
        <span className="sr-only" role="status" aria-live="polite">
          {t('onboarding.progress', { current: stepIdx + 1, total: totalSteps })}
        </span>

        <div className="flex w-full items-center gap-2 pt-2">
          <Button variant="ghost" size="md" onClick={dismiss} className="flex-1">
            {t('onboarding.skip')}
          </Button>
          <Button variant="primary" size="md" onClick={next} className="flex-1">
            {isLast ? t('onboarding.done') : t('onboarding.next')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
