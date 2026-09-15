'use client'

import Link from 'next/link'
import { LangPicker } from './LangPicker'
import { ThemeToggle } from './ThemeToggle'

/**
 * Bandeau haut. Volontairement pauvre : ni menu, ni compte, ni notification.
 * Le nom du site rassure le vacancier sur le fait qu'il est au bon endroit ;
 * les deux réglages à droite sont les seuls qu'il puisse avoir besoin de
 * toucher, et il les touche une fois.
 */
export function TopBar({ siteName }: { siteName?: string | undefined }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-2">
      <Link href="/" className="min-w-0 flex-1">
        <span className="block truncate text-eyebrow font-bold uppercase tracking-[0.12em] text-ink-muted">
          SportLocker
        </span>
        {siteName ? (
          <span className="block text-[0.9375rem] font-bold leading-tight text-ink">{siteName}</span>
        ) : null}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        <LangPicker />
        <ThemeToggle />
      </div>
    </header>
  )
}

export function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error'
  children: React.ReactNode
}) {
  const styles =
    tone === 'error'
      ? 'border-danger/40 bg-danger-soft text-danger'
      : 'border-line bg-surface-2 text-ink-muted'

  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={`rounded-card border px-4 py-3 text-[0.9375rem] leading-relaxed ${styles}`}
    >
      {children}
    </p>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-ink-muted" role="status">
      <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-line border-t-brand" />
      <span className="text-[0.9375rem]">{label}</span>
    </div>
  )
}

/**
 * La pastille de disponibilité, reprise de l'ancienne app.
 *
 * C'était le seul élément de l'écran précédent qu'on lisait sans lire : un
 * chiffre sur fond coloré dit « il y en a » ou « il n'y en a plus » avant même
 * qu'on ait décodé le mot à côté. Le mot reste quand même, parce qu'une
 * information portée par la seule couleur n'existe pas pour un daltonien.
 */
export function StockPill({ count, label }: { count: number; label: string }) {
  const empty = count <= 0
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-bold tabular-nums ' +
        (empty ? 'bg-surface-2 text-ink-muted' : 'bg-brand-soft text-brand')
      }
    >
      {label}
    </span>
  )
}
