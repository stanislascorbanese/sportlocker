'use client'

import { Bell, Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../lib/cn'
import { useT } from '../lib/i18n/I18nProvider'
import {
  currentPermission,
  detectPushSupport,
  getCurrentSubscription,
  subscribePush,
} from '../lib/push'

/**
 * Bannière discrète d'opt-in aux notifications push, affichée en home.
 *
 * Contrat d'affichage — la bannière ne se montre QUE si :
 *   - Web Push est supporté (SW + PushManager + secure context)
 *   - la permission est encore `default` (ni accordée, ni refusée)
 *   - aucune subscription active n'existe déjà pour ce browser
 *   - l'utilisateur ne l'a pas déjà écartée (flag localStorage, une fois pour
 *     toutes, comme l'onboarding)
 *
 * Toute la détection se fait dans `useEffect` (jamais au render initial) pour
 * éviter un mismatch SSR : le serveur ne connaît ni `Notification.permission`
 * ni localStorage → premier paint toujours `null` (rien), puis resync client.
 *
 * Le réglage fin du délai de rappel reste sur /profile — ici on propose juste
 * l'activation en un tap, avec le délai par défaut côté backend.
 */
const STORAGE_KEY = 'sl-push-banner-dismissed'

type BannerState = 'hidden' | 'prompt' | 'enabling' | 'enabled'

export function PushOptInBanner() {
  const t = useT()
  const [state, setState] = useState<BannerState>('hidden')

  useEffect(() => {
    if (detectPushSupport() !== 'supported') return
    if (currentPermission() !== 'default') return

    let cancelled = false
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) return
    } catch {
      // localStorage indispo (Safari mode privé strict) → on n'affiche pas,
      // plutôt que de risquer de spammer à chaque visite sans pouvoir mémoriser.
      return
    }

    // Une subscription peut exister sans que la permission soit `granted` très
    // longtemps, mais on double-check pour ne pas proposer d'activer ce qui
    // l'est déjà.
    getCurrentSubscription()
      .then((sub) => {
        if (!cancelled && sub === null) setState('prompt')
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [])

  function persistDismissed() {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // idem : best-effort
    }
  }

  function dismiss() {
    persistDismissed()
    setState('hidden')
  }

  async function enable() {
    setState('enabling')
    const res = await subscribePush()
    // Quel que soit le résultat, on ne re-proposera plus : succès → activé,
    // échec/refus → l'utilisateur pourra toujours réessayer depuis /profile.
    persistDismissed()
    if (res.ok) {
      setState('enabled')
      window.setTimeout(() => setState('hidden'), 2200)
    } else {
      setState('hidden')
    }
  }

  if (state === 'hidden') return null

  return (
    <div className="px-5 pt-3">
      <div
        className={cn(
          'flex animate-slide-up items-start gap-3 rounded-card border p-3',
          'border-emerald-200 bg-emerald-50 dark:border-emerald-400/25 dark:bg-emerald-500/10',
        )}
        role="region"
        aria-label={t('push.banner.title')}
      >
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
          {state === 'enabled' ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Bell className="h-4 w-4" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {state === 'enabled' ? (
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-100" role="status">
              {t('push.banner.enabled')}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-navy-900 dark:text-white">
                {t('push.banner.title')}
              </p>
              <p className="mt-0.5 text-meta leading-relaxed text-gray-600 dark:text-white/60">
                {t('push.banner.body')}
              </p>
              <button
                type="button"
                onClick={enable}
                disabled={state === 'enabling'}
                className="mt-2.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-base hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
              >
                {state === 'enabling' ? t('push.banner.enabling') : t('push.banner.enable')}
              </button>
            </>
          )}
        </div>

        {state !== 'enabled' && (
          <button
            type="button"
            onClick={dismiss}
            disabled={state === 'enabling'}
            aria-label={t('push.banner.dismiss')}
            className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors duration-base hover:text-gray-600 disabled:opacity-50 dark:text-white/40 dark:hover:text-white/70"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
