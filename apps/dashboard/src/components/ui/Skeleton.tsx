import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export type SkeletonRounded = 'sm' | 'md' | 'lg' | 'full' | 'card'

const ROUNDED: Record<SkeletonRounded, string> = {
  sm: 'rounded',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
  card: 'rounded-card',
}

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number
  height?: string | number
  rounded?: SkeletonRounded
}

export function Skeleton({
  width,
  height,
  rounded = 'md',
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Chargement"
      className={cn(
        'animate-shimmer bg-[length:200%_100%]',
        'bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100',
        'dark:from-white/5 dark:via-white/15 dark:to-white/5',
        ROUNDED[rounded],
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}
