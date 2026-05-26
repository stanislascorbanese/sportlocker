import { AlertCircle } from 'lucide-react'

import { cn } from '../../lib/cn'

export interface ErrorStateProps {
  title?: string
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}

/**
 * Boîte d'erreur inline. Pour un message d'erreur fatal pleine page,
 * composer avec `<EmptyState>` + ton `danger`.
 */
export function ErrorState({
  title = 'Une erreur est survenue',
  message,
  onRetry,
  retryLabel = 'Réessayer',
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-card border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{title}</p>
        <p className="text-meta text-rose-200/80">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-meta font-medium text-rose-100 underline-offset-2 transition-colors duration-base hover:underline focus-visible:outline-none focus-visible:underline"
          >
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  )
}
