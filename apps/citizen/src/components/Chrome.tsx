import Link from 'next/link'
import { ThemeToggle } from './ThemeToggle'

/**
 * Bandeau haut. Volontairement pauvre : ni menu, ni compte, ni notification.
 * Le nom du site rassure le vacancier sur le fait qu'il est au bon endroit,
 * et c'est tout ce qu'il a besoin de lire ici.
 */
export function TopBar({ siteName }: { siteName?: string | undefined }) {
  return (
    <header className="mb-6 flex items-center justify-between gap-3">
      <Link href="/" className="min-w-0">
        <span className="block truncate text-eyebrow font-bold uppercase tracking-[0.12em] text-ink-muted">
          SportLocker
        </span>
        {siteName ? (
          <span className="block truncate text-[0.9375rem] font-bold text-ink">{siteName}</span>
        ) : null}
      </Link>
      <ThemeToggle />
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
