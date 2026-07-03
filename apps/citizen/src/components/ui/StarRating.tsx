'use client'

import { Star } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../lib/cn'

const SIZE_CLASS = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-9 w-9',
} as const

export interface StarRatingProps {
  /** Note affichée (0..max). Pour un affichage moyen, arrondi à l'entier le plus proche. */
  value: number
  max?: number
  size?: keyof typeof SIZE_CLASS
  className?: string
  /**
   * Si fourni, le composant devient interactif (5 boutons tactiles) et appelle
   * `onRate(n)` au clic. Sinon il est en lecture seule (affichage d'étoiles).
   */
  onRate?: (rating: number) => void
  /** Libellé accessible par étoile en mode interactif, ex. `(n) => `${n} étoiles``. */
  ariaLabel?: (n: number) => string
}

/**
 * Étoiles de notation — deux modes :
 *   - lecture seule (défaut) : remplit `Math.round(value)` étoiles. Utilisé pour
 *     la note moyenne d'un distributeur.
 *   - interactif (`onRate` fourni) : 5 boutons, survol/focus met en avant la
 *     note pressentie. Utilisé dans la carte d'avis après un retour.
 */
export function StarRating({
  value,
  max = 5,
  size = 'md',
  className,
  onRate,
  ariaLabel,
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const interactive = typeof onRate === 'function'
  const active = hover ?? Math.round(value)

  const stars = Array.from({ length: max }, (_, i) => i + 1)

  if (!interactive) {
    return (
      <span className={cn('inline-flex items-center gap-0.5', className)} aria-hidden="true">
        {stars.map((n) => (
          <Star
            key={n}
            className={cn(
              SIZE_CLASS[size],
              n <= active
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-gray-300 dark:text-white/25',
            )}
          />
        ))}
      </span>
    )
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="radiogroup">
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={ariaLabel ? ariaLabel(n) : `${n}`}
          onClick={() => onRate!(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(null)}
          className="rounded-md p-1 transition-transform duration-base ease-out-soft active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <Star
            className={cn(
              SIZE_CLASS[size],
              n <= active
                ? 'fill-amber-400 text-amber-400'
                : 'fill-transparent text-gray-300 dark:text-white/25',
            )}
          />
        </button>
      ))}
    </div>
  )
}
