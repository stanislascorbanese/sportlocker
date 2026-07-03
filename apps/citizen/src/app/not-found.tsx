'use client'

import { Compass, Home } from 'lucide-react'
import Link from 'next/link'

import { buttonClassName } from '../components/ui/Button'
import { useT } from '../lib/i18n/I18nProvider'

/**
 * Page 404 brandée. Rendue par Next.js pour toute route inconnue (et via
 * `notFound()`). Vit dans le root layout → a accès aux providers (i18n, theme).
 *
 * Client component pour utiliser `useT()` — le rendu serveur tombe en FR par
 * défaut (cf. I18nProvider) puis resync au mount, comportement identique au
 * reste de l'app.
 */
export default function NotFound() {
  const t = useT()

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center bg-white dark:bg-navy-900">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
        <Compass className="h-9 w-9" aria-hidden="true" />
      </div>

      <p className="font-display text-5xl font-bold tracking-tight text-navy-900 dark:text-white">
        404
      </p>

      <div className="space-y-2">
        <h1 className="font-display text-xl font-semibold text-navy-900 dark:text-white">
          {t('notfound.title')}
        </h1>
        <p className="text-sm text-gray-600 dark:text-white/60">
          {t('notfound.description')}
        </p>
      </div>

      <Link href="/" className={buttonClassName({ variant: 'primary', size: 'lg' })}>
        <Home className="h-4 w-4" aria-hidden="true" />
        {t('notfound.home')}
      </Link>
    </main>
  )
}
