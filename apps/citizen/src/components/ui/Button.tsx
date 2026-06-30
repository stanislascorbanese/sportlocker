import { Loader2 } from 'lucide-react'
import { type ButtonHTMLAttributes, forwardRef } from 'react'

import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-500 ' +
    'disabled:bg-emerald-600/40 disabled:text-white/70 ' +
    'dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400 ' +
    'dark:disabled:bg-emerald-500/40 dark:disabled:text-navy-900/50',
  secondary:
    'border border-gray-200 bg-white text-navy-900 hover:border-gray-300 hover:bg-gray-50 ' +
    'disabled:border-gray-100 disabled:bg-gray-50 disabled:text-gray-400 ' +
    'dark:border-white/15 dark:bg-white/5 dark:text-white/90 dark:hover:border-white/30 dark:hover:bg-white/10 ' +
    'dark:disabled:border-white/5 dark:disabled:bg-white/[0.02] dark:disabled:text-white/30',
  destructive:
    'bg-rose-600 text-white hover:bg-rose-500 ' +
    'disabled:bg-rose-600/40 disabled:text-white/70 ' +
    'dark:bg-rose-500 dark:text-navy-900 dark:hover:bg-rose-400 ' +
    'dark:disabled:bg-rose-500/40 dark:disabled:text-navy-900/50',
  ghost:
    'bg-transparent text-navy-900/80 hover:bg-gray-100 disabled:text-gray-400 ' +
    'dark:text-white/80 dark:hover:bg-white/5 dark:disabled:text-white/30',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
}

/**
 * Renvoie uniquement la className composée — utile pour styler un `<Link>`
 * de Next ou un `<a>` avec exactement le même look que le `<Button>`.
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
} = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold',
    'transition-[background-color,border-color,transform,opacity,color] duration-base ease-out-soft',
    'active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-emerald-400/60 dark:focus-visible:ring-offset-navy-900',
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
  )
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    loading = false,
    icon,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(buttonClassName({ variant, size, fullWidth }), className)}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
})
