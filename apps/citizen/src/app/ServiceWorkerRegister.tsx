'use client'

import { useEffect } from 'react'

type AppBadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>
}

/**
 * Enregistre le service worker /sw.js au montage du root layout.
 * Marche en silence si le navigateur ne supporte pas (vieux Safari, etc).
 * En dev (NODE_ENV=development) on skip pour ne pas mettre en cache des
 * assets HMR.
 *
 * Au mount on clear aussi l'app badge (point rouge sur l'icône PWA posé par
 * le service worker lors d'un push) — si l'utilisateur ouvre l'app, c'est
 * qu'il a "lu" la notif.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Clear le badge même en dev (pas de SW en dev mais badge possiblement
    // setté lors d'une session prod précédente sur la même URL).
    const nav = window.navigator as AppBadgeNavigator
    if (typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => undefined)
    }

    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.error('[sw] registration failed', err))
  }, [])
  return null
}
