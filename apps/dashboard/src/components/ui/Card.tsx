import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export type CardVariant = 'default' | 'elevated' | 'accent'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default:
    'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5',
  elevated:
    'border-gray-200 bg-white shadow-card dark:border-white/10 dark:bg-navy-800 dark:bg-gradient-to-br dark:from-white/[0.08] dark:to-white/[0.02] dark:shadow-elevated',
  accent:
    'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/[0.06]',
}

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: CardPadding
}

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border',
        VARIANT_CLASSES[variant],
        PADDING_CLASSES[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
