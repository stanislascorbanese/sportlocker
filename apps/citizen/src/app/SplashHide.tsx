'use client'

import { useEffect } from 'react'

import { useAuth } from '../lib/auth-context'

/**
 * Marque le splash comme « prêt à disparaître » dès que :
 *   1. React s'est hydraté (le composant est monté côté client) ET
 *   2. Firebase Auth a fini de restaurer la session depuis IndexedDB
 *      (≈ 100-500ms en cold start PWA).
 *
 * Sans la gate (2), le splash disparaît au 1er paint React et expose le
 * fallback texte « Chargement… » de `useRequireAuth` pendant que Firebase
 * lit toujours IDB. Comportement signalé en QA iOS PWA.
 *
 * Double rAF garantit qu'au moins une frame avec le splash visible a été
 * peinte avant la transition de sortie (sinon l'animation est parfois
 * avalée par la pression de rendu initiale).
 *
 * ⚠ On NE retire PAS le node `#sl-splash` du DOM. Il est déclaré dans le JSX
 * du root layout, donc React garde une référence interne dessus. Un
 * `removeChild` manuel corrompt le reconciler côté Safari (`NotFoundError:
 * The object can not be found here.`) à la navigation suivante. Le CSS
 * (`opacity: 0; pointer-events: none` après `data-splash-done`) suffit à
 * le rendre invisible et non-bloquant.
 */
export function SplashHide() {
  const { loading } = useAuth()

  useEffect(() => {
    if (loading) return
    let cancelled = false

    const finalize = () => {
      if (cancelled) return
      document.documentElement.setAttribute('data-splash-done', 'true')
    }

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(finalize)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [loading])

  return null
}
