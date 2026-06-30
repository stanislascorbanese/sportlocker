import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/**
 * État "rien à montrer" : icône optionnelle dans un cercle, titre, sous-titre
 * descriptif, et un slot action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border px-5 py-8 text-center',
        'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5',
        className,
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-navy-900 dark:text-white">{title}</p>
        {description && (
          <p className="max-w-xs text-meta leading-relaxed text-gray-500 dark:text-white/50">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
