import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export type BadgeSize = 'xs' | 'sm'

const TONE: Record<BadgeTone, string> = {
  success:
    'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200',
  warning:
    'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200',
  danger:
    'border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200',
  info:
    'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200',
  neutral:
    'border-gray-200 bg-gray-100 text-gray-700 dark:border-white/15 dark:bg-white/10 dark:text-white/70',
}

const SIZE: Record<BadgeSize, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-1 text-[11px]',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  size?: BadgeSize
  icon?: ReactNode
}

export function Badge({
  tone = 'neutral',
  size = 'sm',
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium uppercase tracking-wider',
        TONE[tone],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}
