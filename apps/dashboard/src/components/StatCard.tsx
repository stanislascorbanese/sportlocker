import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_STYLE: Record<Tone, { border: string; accent: string; valueText: string }> = {
  neutral: { border: 'border-white/10',         accent: 'bg-white/5',            valueText: 'text-white' },
  good:    { border: 'border-emerald-500/30',   accent: 'bg-emerald-500/10',     valueText: 'text-emerald-300' },
  warn:    { border: 'border-amber-500/30',     accent: 'bg-amber-500/10',       valueText: 'text-amber-300' },
  bad:     { border: 'border-rose-500/30',      accent: 'bg-rose-500/10',        valueText: 'text-rose-300' },
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  href,
  icon,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  href?: string
  icon?: ReactNode
}) {
  const s = TONE_STYLE[tone]

  const inner = (
    <div className={cn(
      'group relative overflow-hidden rounded-xl border bg-navy-800 p-3 transition sm:p-4',
      s.border,
      href && 'hover:border-white/30',
    )}>
      <div className={cn('absolute inset-x-0 top-0 h-1', s.accent)} />
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-wider text-white/50">{label}</p>
        {icon && <span className="text-white/40">{icon}</span>}
      </div>
      <p className={cn('mt-2 font-display text-2xl tabular-nums sm:text-3xl', s.valueText)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-white/55">{hint}</p>}
      {href && (
        <span className="absolute bottom-2 right-3 text-[11px] text-white/30 transition group-hover:text-white/60">
          détails →
        </span>
      )}
    </div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
