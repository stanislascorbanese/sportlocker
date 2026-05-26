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

/**
 * Bloc placeholder pendant un chargement. Anime un dégradé "shimmer" via
 * background-position pour rester GPU-friendly (vs animation d'opacity qui
 * provoque des repaints fréquents sur certains Safari mobiles).
 */
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
        'bg-[length:200%_100%] bg-gradient-to-r from-white/5 via-white/15 to-white/5 animate-shimmer',
        ROUNDED[rounded],
        className,
      )}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}
