'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const nextLabel = theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextLabel}
      title={nextLabel}
      className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition-colors duration-base hover:bg-surface-2 hover:text-ink"
    >
      {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  )
}
