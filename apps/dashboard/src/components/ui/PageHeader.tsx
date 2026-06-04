import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export interface PageHeaderProps {
  title: string
  eyebrow?: string
  icon?: ReactNode
  description?: string
  actions?: ReactNode
  className?: string
}

/**
 * Header standard d'une page dashboard. Pas de back button (la sidebar
 * sert de navigation principale). Slot `icon` pour le pictogramme à
 * gauche du titre + slot `actions` à droite (boutons d'action contextuels).
 */
export function PageHeader({
  title,
  eyebrow,
  icon,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-2.5 text-brand-400">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-eyebrow font-medium uppercase text-gray-500 dark:text-white/50">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-white/60">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
