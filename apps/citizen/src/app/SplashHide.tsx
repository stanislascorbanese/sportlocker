'use client'

import { useEffect } from 'react'

/**
 * Marque le splash comme « prêt à disparaître » dès que React a effectué
 * son premier paint. Posé via attribut sur <html> pour rester en sync avec
 * le script anti-FOUC et fonctionner côté SSR.
 *
 * Double rAF garantit qu'au moins une frame avec le splash visible a été
 * peinte avant la transition de sortie — sinon l'animation est parfois
 * avalée par la pression de rendu initiale (notamment sur cold start PWA).
 *
 * Le node est supprimé du DOM 500ms plus tard (durée de la transition CSS)
 * pour libérer la couche compositor et éviter qu'un clic accidentel ne le
 * réveille via z-index résiduel.
 */
export function SplashHide() {
  useEffect(() => {
    let cancelled = false

    const finalize = () => {
      if (cancelled) return
      document.documentElement.setAttribute('data-splash-done', 'true')
      window.setTimeout(() => {
        const node = document.getElementById('sl-splash')
        if (node?.parentNode) node.parentNode.removeChild(node)
      }, 500)
    }

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(finalize)
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [])

  return null
}
