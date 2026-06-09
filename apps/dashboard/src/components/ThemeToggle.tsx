'use client'

import { Moon, Sun } from 'lucide-react'

import { useTheme } from '../lib/theme'
import { useLang } from '../lib/lang-client'
import { commonStrings } from '../lib/i18n/common'

/**
 * Bouton soleil/lune dans la sidebar dashboard. Toggle direct dark↔light
 * (le mode `system` reste accessible via API mais pas par l'UI).
 *
 * Le dashboard démarre en dark par défaut (toutes les pages legacy
 * supposent un fond navy). Light mode est opt-in et peut révéler des
 * inconsistances sur les pages pas encore refactorées avec les atomes.
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const lang = useLang()
  const t = commonStrings(lang)
  const isDark = resolved === 'dark'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.a11yThemeToggle}
      title={t.a11yThemeTitle}
      className="rounded-md p-2 transition-colors duration-base text-gray-500 hover:bg-gray-100 hover:text-navy-900 dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  )
}
