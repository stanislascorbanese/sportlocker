import Link from 'next/link'

import { fetchDistributors } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { distributorsStrings } from '../../lib/i18n/distributors'
import { makeMetadata } from '../../lib/i18n/metadata'
import { LiveFleet } from './LiveFleet'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).metaTitle)

export default async function DistributorsListPage() {
  const lang = await getLang()
  const t = distributorsStrings(lang)
  const c = commonStrings(lang)

  let distributors: Awaited<ReturnType<typeof fetchDistributors>> = []
  let fetchError: string | null = null

  try {
    distributors = await fetchDistributors()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
            {t.pageTitle}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton />
          <Link
            href="/distributors/new"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-base ease-out-soft bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
          >
            {t.newDistributor}
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-card border p-4 text-sm border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <p className="font-semibold">{c.apiErrorFallback}</p>
          <p className="mt-1 font-mono text-meta text-rose-700/80 dark:text-rose-300/80">
            {fetchError}
          </p>
        </div>
      )}

      {!fetchError && distributors.length === 0 && (
        <div className="rounded-card border p-8 text-center text-sm border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-navy-800 dark:text-white/55">
          {t.emptyState}{' '}
          <code className="rounded px-1.5 py-0.5 font-mono text-meta bg-gray-200 text-navy-900 dark:bg-navy-700 dark:text-white/80">
            {t.emptyHint}
          </code>
        </div>
      )}

      {distributors.length > 0 && (
        <LiveFleet initialDistributors={distributors} lang={lang} />
      )}
    </div>
  )
}
