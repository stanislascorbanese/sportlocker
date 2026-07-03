'use client'

import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect } from 'react'

import { buttonClassName } from '../components/ui/Button'
import { useT } from '../lib/i18n/I18nProvider'

/**
 * Error boundary racine (App Router). Next monte ce composant quand une erreur
 * non gérée remonte depuis un segment sous le root layout. Doit être un client
 * component et reçoit `error` + `reset` (re-render du segment planté).
 *
 * On remonte l'erreur à Sentry (le même DSN que le reste de la PWA) pour ne pas
 * perdre l'observabilité — l'error boundary avale sinon la stack.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center bg-white dark:bg-navy-900">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
        <AlertTriangle className="h-9 w-9" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="font-display text-xl font-semibold text-navy-900 dark:text-white">
          {t('error.title')}
        </h1>
        <p className="text-sm text-gray-600 dark:text-white/60">
          {t('error.description')}
        </p>
        {error.digest && (
          <p className="pt-1 font-mono text-[10px] text-gray-400 dark:text-white/30">
            {error.digest}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <button
          type="button"
          onClick={() => reset()}
          className={buttonClassName({ variant: 'primary', size: 'lg', fullWidth: true })}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t('error.retry')}
        </button>
        <Link
          href="/"
          className={buttonClassName({ variant: 'secondary', size: 'lg', fullWidth: true })}
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {t('error.home')}
        </Link>
      </div>
    </main>
  )
}
