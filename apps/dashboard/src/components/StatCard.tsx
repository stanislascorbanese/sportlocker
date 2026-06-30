import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '../lib/cn'

type Tone = 'neutral' | 'good' | 'warn' | 'bad'

// Tuile KPI utilisée sur les pages de pilotage (/, /me, /reports). Chaque tone
// reçoit ses variantes light (X-200 + X-100 + X-700) en plus du dark existant
// (X-500/30 + X-500/10 + X-300). Le tone `neutral` retombe sur gray/navy.
const TONE_STYLE: Record<Tone, { border: string; accent: string; valueText: string }> = {
  neutral: {
    border: 'border-gray-200 dark:border-white/10',
    accent: 'bg-gray-100 dark:bg-white/5',
    valueText: 'text-navy-900 dark:text-white',
  },
  good: {
    border: 'border-emerald-200 dark:border-emerald-500/30',
    accent: 'bg-emerald-100 dark:bg-emerald-500/10',
    valueText: 'text-emerald-700 dark:text-emerald-300',
  },
  warn: {
    border: 'border-amber-200 dark:border-amber-500/30',
    accent: 'bg-amber-100 dark:bg-amber-500/10',
    valueText: 'text-amber-700 dark:text-amber-300',
  },
  bad: {
    border: 'border-rose-200 dark:border-rose-500/30',
    accent: 'bg-rose-100 dark:bg-rose-500/10',
    valueText: 'text-rose-700 dark:text-rose-300',
  },
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
      'group relative overflow-hidden rounded-card border bg-white p-3 shadow-card transition-colors duration-base ease-out-soft sm:p-4 dark:bg-navy-800 dark:shadow-none',
      s.border,
      href && 'hover:border-gray-300 dark:hover:border-white/30',
    )}>
      <div className={cn('absolute inset-x-0 top-0 h-1', s.accent)} />
      <div className="mt-1 flex items-start justify-between gap-3">
        <p className="text-eyebrow text-gray-500 dark:text-white/50">{label}</p>
        {icon && <span className="text-gray-400 dark:text-white/40">{icon}</span>}
      </div>
      <p className={cn('mt-2 font-display text-2xl tabular-nums sm:text-3xl', s.valueText)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-600 dark:text-white/55">{hint}</p>}
      {href && (
        <span className="absolute bottom-2 right-3 text-meta text-gray-400 transition-colors duration-base group-hover:text-navy-900 dark:text-white/30 dark:group-hover:text-white/60">
          détails →
        </span>
      )}
    </div>
  )

  if (href) return <Link href={href}>{inner}</Link>
  return inner
}
