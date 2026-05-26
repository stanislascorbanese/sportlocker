'use client'

import { useI18n } from '../lib/i18n/I18nProvider'

/**
 * Toggle FR/EN simple. Affiche les 2 codes côte à côte, le sélectionné est
 * mis en avant. Pour 2 langues, c'est plus clair qu'un menu dropdown.
 *
 * Quand on ajoute une 3ème langue, basculer sur un menu Sheet (atome
 * existant) avec liste de langues.
 */
export function LanguageToggle() {
  const { locale, setLocale } = useI18n()
  return (
    <div
      role="group"
      aria-label="Langue / Language"
      className="inline-flex items-center rounded-full bg-gray-100 p-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy-900 dark:bg-white/10 dark:text-white"
    >
      <button
        type="button"
        onClick={() => setLocale('fr')}
        aria-pressed={locale === 'fr'}
        className={
          locale === 'fr'
            ? 'rounded-full bg-white px-2 py-1 text-navy-900 shadow-card transition-colors duration-base dark:bg-navy-900 dark:text-white'
            : 'rounded-full px-2 py-1 text-navy-900/60 transition-colors duration-base hover:text-navy-900 dark:text-white/55 dark:hover:text-white/85'
        }
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        className={
          locale === 'en'
            ? 'rounded-full bg-white px-2 py-1 text-navy-900 shadow-card transition-colors duration-base dark:bg-navy-900 dark:text-white'
            : 'rounded-full px-2 py-1 text-navy-900/60 transition-colors duration-base hover:text-navy-900 dark:text-white/55 dark:hover:text-white/85'
        }
      >
        EN
      </button>
    </div>
  )
}
