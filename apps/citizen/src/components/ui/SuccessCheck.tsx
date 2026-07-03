import { cn } from '../../lib/cn'

export interface SuccessCheckProps {
  /** Taille du cercle (classe Tailwind sur le SVG). Défaut `h-16 w-16`. */
  className?: string
  label?: string
}

/**
 * Coche de succès animée (paiement confirmé). Le cercle puis la coche se
 * tracent l'un après l'autre via l'animation `draw` (cf. tailwind.config).
 *
 * Astuce `pathLength={1}` : normalise la longueur de chaque path à 1 unité, ce
 * qui permet d'utiliser un seul keyframe `strokeDashoffset 1 → 0` sans avoir à
 * calculer la longueur réelle (rayon du cercle, diagonale de la coche…).
 *
 * En mode « réduction des animations » (globals.css force
 * `animation-duration: 0.01ms`), les deux tracés se complètent instantanément :
 * la coche reste donc visible plutôt que figée à l'état invisible.
 */
export function SuccessCheck({ className, label }: SuccessCheckProps) {
  return (
    <svg
      viewBox="0 0 52 52"
      className={cn('h-16 w-16 text-emerald-500 dark:text-emerald-400', className)}
      role="img"
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        pathLength={1}
        className="animate-draw"
        style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
      />
      <path
        d="M15 27 l7.5 7.5 L38 19"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="animate-draw"
        // Le tracé de la coche démarre après celui du cercle (fill-mode `both`
        // → invisible pendant le délai).
        style={{ strokeDasharray: 1, strokeDashoffset: 1, animationDelay: '340ms' }}
      />
    </svg>
  )
}
