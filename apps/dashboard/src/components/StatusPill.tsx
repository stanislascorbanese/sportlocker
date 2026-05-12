import { cn } from '../lib/cn'

type Status = 'online' | 'offline' | 'maintenance' | 'decommissioned'

const STYLE: Record<Status, { dot: string; text: string; bg: string; border: string }> = {
  online:         { dot: 'bg-emerald-400',  text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  offline:        { dot: 'bg-rose-400',     text: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30' },
  maintenance:    { dot: 'bg-amber-400',    text: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  decommissioned: { dot: 'bg-zinc-400',     text: 'text-zinc-300',    bg: 'bg-zinc-500/10',    border: 'border-zinc-500/30' },
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
