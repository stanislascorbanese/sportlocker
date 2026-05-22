'use client'

import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Bouton "Installer l'app sur ton écran d'accueil" — affiché uniquement
 * quand le navigateur supporte la PWA et que l'app n'est pas déjà installée.
 *
 * Branches :
 *   - Chrome / Edge / Brave / Samsung Internet : fire `beforeinstallprompt`,
 *     on capture l'event et l'appelle au clic → modal natif Chrome.
 *   - iOS Safari : ne fire JAMAIS `beforeinstallprompt`. On le détecte via
 *     userAgent et on affiche un encart explicatif avec les étapes manuelles
 *     (Partager → "Sur l'écran d'accueil"). C'est pénible mais Apple l'a
 *     décidé ainsi.
 *   - Déjà installée (mode `standalone`) : on ne rend rien.
 *   - Autre browser (Firefox desktop, vieux WebView…) : on ne rend rien.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  // 1. Media query officielle (Chrome, Edge, Firefox)
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // 2. Vieux iOS Safari : `navigator.standalone` (non standard mais utilisé)
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

    // Détecte si l'utilisateur installe pendant la session (l'event
    // `appinstalled` clôt notre prompt).
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
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Installer l'app sur ton iPhone</p>
            <p className="text-xs leading-relaxed text-white/60">
              Appuie sur <span className="font-medium text-white/80">Partager</span> en bas
              de Safari, puis <span className="font-medium text-white/80">« Sur l'écran d'accueil »</span>.
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (!promptEvent) return null

  async function onInstall() {
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    // Outcome possible : 'accepted' | 'dismissed'. Dans les deux cas le prompt
    // ne peut être réinvoqué — on le décharge pour cacher le bouton.
    setPromptEvent(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  return (
    <button
      type="button"
      onClick={onInstall}
      className="flex w-full items-center gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-left transition hover:bg-emerald-500/20"
    >
      <Smartphone className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
      <span className="flex-1">
        <span className="block text-sm font-medium text-white">Installer l'app</span>
        <span className="block text-xs text-white/60">
          Accès direct depuis ton écran d'accueil, sans navigateur.
        </span>
      </span>
    </button>
  )
}
