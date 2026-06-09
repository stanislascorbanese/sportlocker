import Link from 'next/link'

import { fetchDistributors } from '../../lib/api'
import { StatusPill } from '../../components/StatusPill'
import { BatteryGauge } from '../../components/BatteryGauge'
import { RefreshButton } from '../../components/RefreshButton'
import { getLang } from '../../lib/lang-server'
import { commonStrings, distributorStatusLabel, fmtRelative } from '../../lib/i18n/common'
import { distributorsStrings } from '../../lib/i18n/distributors'
import { makeMetadata } from '../../lib/i18n/metadata'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).metaTitle)

function fmtCoord(coord: number | null): string {
  return coord == null ? '—' : coord.toFixed(4)
}

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

  const online = distributors.filter((d) => d.status === 'online').length
  const totalIdle = distributors.reduce((acc, d) => acc + d.idleLockers, 0)
  const totalLockers = distributors.reduce((acc, d) => acc + d.lockerCount, 0)
  const countLabel = distributors.length > 1 ? t.distributorsCountMany : t.distributorsCount1

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
            {t.pageTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {distributors.length} {countLabel} ·{' '}
            <span className="text-emerald-700 dark:text-emerald-300">{online} {c.statusOnline}</span> ·{' '}
            {totalIdle} / {totalLockers} {t.lockersFreeOf}
          </p>
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
        <>
        {/* Mobile : carte par distributeur. La table dense est cachée < md
            car scroll horizontal sur 720px pénible en astreinte mobile. */}
        <div className="space-y-3 md:hidden">
          {distributors.map((d) => (
            <Link
              key={d.id}
              href={`/distributors/${d.id}`}
              className="block rounded-card border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-navy-800 dark:shadow-none dark:hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-navy-900 dark:text-white">{d.name}</div>
                  <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                    {d.serialNumber}
                  </div>
                </div>
                <StatusPill status={d.status} label={distributorStatusLabel(lang, d.status)} />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-meta">
                <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {t.colLockersFree}
                  </div>
                  <div className="mt-0.5 font-display text-sm tabular-nums">
                    <span className={
                      d.idleLockers === 0
                        ? 'font-semibold text-rose-700 dark:text-rose-300'
                        : d.idleLockers === 1
                          ? 'font-semibold text-amber-700 dark:text-amber-300'
                          : 'font-semibold text-emerald-700 dark:text-emerald-300'
                    }>{d.idleLockers}</span>
                    <span className="text-gray-500 dark:text-white/40"> / {d.lockerCount}</span>
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {t.colBattery}
                  </div>
                  <div className="mt-1">
                    <BatteryGauge percent={d.batteryPercent} />
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {t.colLastSeen}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-navy-900 dark:text-white/85">
                    {fmtRelative(lang, d.lastSeenAt)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Desktop : tableau dense classique */}
        <div className="hidden overflow-x-auto rounded-card border border-gray-200 bg-white md:block dark:border-white/10 dark:bg-navy-800">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-eyebrow uppercase bg-gray-100 text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colDistributor}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                <th className="px-4 py-3 font-medium">{t.colLockersFree}</th>
                <th className="px-4 py-3 font-medium">{t.colBattery}</th>
                <th className="px-4 py-3 font-medium">{t.colPosition}</th>
                <th className="px-4 py-3 font-medium">{t.colLastSeen}</th>
                <th className="px-4 py-3 text-right font-medium">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {distributors.map((d) => (
                <tr
                  key={d.id}
                  className="transition-colors duration-base hover:bg-gray-50 dark:hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-900 dark:text-white">{d.name}</div>
                    <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                      {d.serialNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} label={distributorStatusLabel(lang, d.status)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={
                          d.idleLockers === 0
                            ? 'font-semibold text-rose-700 dark:text-rose-300'
                            : d.idleLockers === 1
                              ? 'font-semibold text-amber-700 dark:text-amber-300'
                              : 'font-semibold text-emerald-700 dark:text-emerald-300'
                        }
                      >
                        {d.idleLockers}
                      </span>
                      <span className="text-gray-500 dark:text-white/40">/ {d.lockerCount}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <BatteryGauge percent={d.batteryPercent} />
                  </td>
                  <td className="px-4 py-3 font-mono text-meta tabular-nums text-gray-700 dark:text-white/70">
                    {fmtCoord(d.latitude)}, {fmtCoord(d.longitude)}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-white/60">
                    {fmtRelative(lang, d.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/distributors/${d.id}`}
                        className="text-meta transition-colors duration-base text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                      >
                        {c.detail}
                      </Link>
                      <Link
                        href={`/distributors/${d.id}/health`}
                        className="text-meta transition-colors duration-base text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                      >
                        {c.health}
                      </Link>
                      <Link
                        href={`/distributors/${d.id}/edit`}
                        className="text-meta transition-colors duration-base text-gray-500 hover:text-navy-900 dark:text-white/55 dark:hover:text-white"
                      >
                        {c.modify}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
