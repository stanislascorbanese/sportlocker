'use client'

import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'

import { cn } from '../../lib/cn'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  /** Hauteur max en vh (default 80) */
  maxHeight?: number
  className?: string
}

/**
 * Bottom sheet contrôlé. Pattern PWA mobile standard pour les confirmations,
 * les sélecteurs, et tout ce qui mérite mieux qu'un `alert()` ou qu'un bloc
 * inline qui pousse le scroll.
 *
 * Implémentation : `<div role="dialog">` plein-écran avec backdrop cliquable
 * pour fermer + Escape. Pas de `<dialog>` natif car son animation d'entrée
 * varie selon les browsers (Safari 17- l'animait pas du tout).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  maxHeight = 80,
  className,
}: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col justify-end"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 cursor-default animate-fade-in bg-black/40 backdrop-blur-sm dark:bg-navy-900/70"
      />
      <div
        className={cn(
          'relative mx-auto w-full max-w-lg border-t shadow-elevated rounded-t-sheet animate-slide-up',
          'border-gray-200 bg-white text-navy-900',
          'dark:border-white/10 dark:bg-navy-800 dark:text-white',
          className,
        )}
        style={{ maxHeight: `${maxHeight}vh` }}
      >
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
          {title ? (
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-navy-900/85 dark:text-white/85">
              {title}
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-full bg-gray-100 p-1.5 text-navy-900 transition-colors duration-base hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="overflow-y-auto px-5 pt-2 pb-[calc(var(--safe-bottom)+1.25rem)]"
          style={{ maxHeight: `calc(${maxHeight}vh - 3.5rem)` }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
