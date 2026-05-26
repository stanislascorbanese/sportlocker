'use client'

import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Card } from '../../components/ui/Card'
import { useT } from '../../lib/i18n/I18nProvider'

/**
 * Bouton "Installer l'app sur ton écran d'accueil" — affiché uniquement
 * quand le navigateur supporte la PWA et que l'app n'est pas déjà installée.
 *
 * Branches :
 *   - Chrome / Edge / Brave / Samsung Internet : `beforeinstallprompt`
 *   - iOS Safari : ne fire jamais l'event → on affiche les étapes manuelles
 *   - Déjà installée (`standalone`) : rien
 *   - Firefox desktop / vieux WebView : rien
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  type IosNavigator = Navigator & { standalone?: boolean }
  if ((window.navigator as IosNavigator).standalone === true) return true
  return false
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
  const webkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit
}

export function InstallButton() {
  const t = useT()
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (isStandaloneMode()) {
      setInstalled(true)
      return
    }
    if (isIosSafari()) {
      setShowIosHint(true)
      return
    }
    const handler = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    const installedHandler = () => setInstalled(true)
    window.addEventListener('appinstalled', installedHandler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
    }
  }, [])

  if (installed) return null

  if (showIosHint) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <Smartphone
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="text-sm font-medium text-navy-900 dark:text-white">
              {t('profile.install.label')}
            </p>
            <p className="text-meta leading-relaxed text-gray-600 dark:text-white/60">
              {t('profile.install.ios_only')}
            </p>
          </div>
        </div>
      </Card>
    )
  }

  if (!promptEvent) return null

  async function onInstall() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  return (
    <button
      type="button"
      onClick={onInstall}
      className="flex w-full items-center gap-3 rounded-card border px-4 py-3 text-left transition-colors duration-base ease-out-soft border-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
    >
      <Smartphone
        className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
        aria-hidden="true"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-navy-900 dark:text-white">
          {t('profile.install.install')}
        </span>
        <span className="block text-meta text-gray-600 dark:text-white/60">
          {t('profile.install.help')}
        </span>
      </span>
    </button>
  )
}
