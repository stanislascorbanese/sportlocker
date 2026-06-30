import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export interface PageHeaderProps {
  title: string
  eyebrow?: string
  backHref?: string
  backLabel?: string
  actions?: ReactNode
  className?: string
}

/**
 * Header standard d'une page citoyenne. Inclut le padding safe-top iOS, un
 * back button optionnel (rendu en `<Link>` Next pour la prefetch) et un slot
 * `actions` à droite.
 *
 * Le slot `actions` est typiquement rempli avec `<HeaderActions />` (qui
 * porte les boutons Profile + Theme + Language + Ma résa conditionnel).
 * Chaque page doit le passer explicitement pour rester découpée — PageHeader
 * est un atome neutre qui n'importe pas i18n/auth.
 */
export function PageHeader({
  title,
  eyebrow,
  backHref,
  backLabel = 'Retour',
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 px-5 pb-3 pt-[calc(var(--safe-top)+0.75rem)]',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className="rounded-full bg-gray-100 p-2 text-navy-900 transition-colors duration-base ease-out-soft hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-eyebrow font-medium uppercase text-emerald-700 dark:text-emerald-300/80">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-lg font-semibold leading-tight">
            {title}
          </h1>
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      )}
    </header>
  )
}
