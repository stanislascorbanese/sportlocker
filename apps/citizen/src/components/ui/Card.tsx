import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export type CardVariant = 'default' | 'elevated' | 'accent'
export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'border-white/10 bg-white/5',
  elevated: 'border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] shadow-elevated',
  accent: 'border-emerald-400/30 bg-emerald-500/[0.06]',
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
