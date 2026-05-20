'use client'

import { useEffect } from 'react'

/**
 * Enregistre le service worker /sw.js au montage du root layout.
 * Marche en silence si le navigateur ne supporte pas (vieux Safari, etc).
 * En dev (NODE_ENV=development) on skip pour ne pas mettre en cache des
 * assets HMR.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.error('[sw] registration failed', err))
  }, [])
  return null
}
