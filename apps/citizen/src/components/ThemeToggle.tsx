'use client'

import { Moon, Sun } from 'lucide-react'

import { useT } from '../lib/i18n/I18nProvider'
import { useTheme } from '../lib/theme'

/**
 * Bouton soleil/lune dans le header. Toggle direct entre `light` et `dark`
 * (le mode `system` reste accessible via API mais pas par l'UI — la majorité
 * des users veulent juste un toggle binaire).
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const t = useT()
  const isDark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? t('nav.theme.light') : t('nav.theme.dark')}
      title={isDark ? t('nav.theme.light') : t('nav.theme.dark')}
      className="rounded-full bg-gray-100 p-2 text-navy-900 transition-colors duration-base ease-out-soft hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
