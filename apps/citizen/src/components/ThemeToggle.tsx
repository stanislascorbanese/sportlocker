'use client'

import { Moon, Sun } from 'lucide-react'
import { useLang } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const { t } = useLang()
  const nextLabel = theme === 'dark' ? t.themeToLight : t.themeToDark

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={nextLabel}
      title={nextLabel}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted transition-colors duration-base hover:bg-surface-2 hover:text-ink"
    >
      {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  )
}
