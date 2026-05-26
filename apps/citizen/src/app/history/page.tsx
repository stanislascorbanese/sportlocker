'use client'

import { PageHeader } from '../../components/ui/PageHeader'
import { useRequireAuth } from '../../lib/auth-context'
import { useT } from '../../lib/i18n/I18nProvider'

export default function HistoryPage() {
  const user = useRequireAuth()
  const t = useT()
  if (!user) return null

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader title={t('history.title')} backHref="/" backLabel={t('nav.back')} />
      <section className="mx-1 rounded-card border p-6 text-center border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
        <p className="text-sm text-gray-600 dark:text-white/60">{t('history.empty.title')}</p>
        <p className="mt-1 text-meta text-gray-400 dark:text-white/40">
          {t('history.empty.description')}
        </p>
      </section>
    </main>
  )
}
