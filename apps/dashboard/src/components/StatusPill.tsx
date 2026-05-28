import { cn } from '../lib/cn'

type Status = 'online' | 'offline' | 'maintenance' | 'decommissioned'

// Pill de statut distributeur. Le dot reste vif dans les deux modes (couleur
// fonctionnelle), seules les surfaces background/border/text reçoivent leurs
// variantes claires (X-50 + X-200 + X-700) en plus des variantes sombres
// existantes (X-500/10 + X-500/30 + X-300).
const STYLE: Record<Status, { dot: string; text: string; bg: string; border: string }> = {
  online: {
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    border: 'border-emerald-200 dark:border-emerald-500/30',
  },
  offline: {
    dot: 'bg-rose-500 dark:bg-rose-400',
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-500/10',
    border: 'border-rose-200 dark:border-rose-500/30',
  },
  maintenance: {
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
    border: 'border-amber-200 dark:border-amber-500/30',
  },
  decommissioned: {
    dot: 'bg-zinc-500 dark:bg-zinc-400',
    text: 'text-zinc-700 dark:text-zinc-300',
    bg: 'bg-zinc-50 dark:bg-zinc-500/10',
    border: 'border-zinc-200 dark:border-zinc-500/30',
  },
}

export function StatusPill({ status }: { status: Status }) {
  const s = STYLE[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide',
      s.bg, s.border, s.text,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {status}
    </span>
  )
}
