import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
export type BadgeSize = 'xs' | 'sm'

const TONE: Record<BadgeTone, string> = {
  success: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
  warning: 'border-amber-400/30 bg-amber-500/15 text-amber-200',
  danger: 'border-rose-400/30 bg-rose-500/15 text-rose-200',
  info: 'border-sky-400/30 bg-sky-500/15 text-sky-200',
  neutral: 'border-white/15 bg-white/10 text-white/70',
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
