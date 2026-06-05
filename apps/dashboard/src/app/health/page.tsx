import Link from 'next/link'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { fetchFleetHealth, type FleetHealthDashboard } from '../../lib/api'
import { StatusPill } from '../../components/StatusPill'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import { commonStrings, distributorStatusLabel, fmtRelative } from '../../lib/i18n/common'
import { alertLabel, healthStrings } from '../../lib/i18n/health'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Santé du parc · SportLocker ops' }

type SearchParams = { filter?: string }

export default async function FleetHealthPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const lang = await getLang()
  const t = healthStrings(lang)
  const c = commonStrings(lang)

  let data: FleetHealthDashboard | null = null
  let fetchError: string | null = null
  try {
    data = await fetchFleetHealth()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const onlyAlerts = sp.filter === 'alerts'
  const allRows = data?.rows ?? []
  const visibleRows = onlyAlerts ? allRows.filter((r) => r.alerts.length > 0) : allRows

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
            {t.pageTitle}
          </h2>
          {data && (
            <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
              {data.total} {data.total > 1 ? t.subtitleMany : t.subtitle1}
              {data.withAlerts > 0 ? (
                <> · <span className="text-rose-700 dark:text-rose-300">
                  {t.withAlertsPrefix} {data.withAlerts} {t.withAlertsSuffix}
                </span></>
              ) : (
                <> · <span className="text-emerald-700 dark:text-emerald-300">{t.allHealthy}</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <FilterTabs current={onlyAlerts ? 'alerts' : 'all'} lang={lang} />
          <RefreshButton />
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {data && data.total === 0 ? (
        <div className="rounded-card border border-dashed bg-white p-8 text-center text-sm text-gray-600 dark:border-white/15 dark:bg-navy-800 dark:text-white/55">
          <p>{t.emptyState}</p>
          <p className="mt-1 text-meta text-gray-500 dark:text-white/40">{t.emptyHint}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border bg-white shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colDistributor}</th>
                <th className="px-4 py-3 font-medium">{t.colCommune}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                <th className="px-4 py-3 font-medium">{t.colLastSeen}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colCpu}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colRssi}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colMemory}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colTickets}</th>
                <th className="px-4 py-3 font-medium">{t.colAlerts}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {visibleRows.map((r) => {
                const hasAlerts = r.alerts.length > 0
                return (
                  <tr
                    key={r.distributor.id}
                    className={cn(
                      'transition-colors duration-base',
                      hasAlerts
                        ? 'bg-rose-50/40 hover:bg-rose-50 dark:bg-rose-500/[0.03] dark:hover:bg-rose-500/[0.06]'
                        : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-navy-900 dark:text-white">{r.distributor.name}</div>
                      <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                        {r.distributor.serialNumber}
                        {r.distributor.firmwareVersion && (
                          <> · {t.firmware} {r.distributor.firmwareVersion}</>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-white/65">
                      {r.distributor.communeName ?? <span className="text-gray-400 dark:text-white/30">{t.noData}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill
                        status={r.distributor.status}
                        label={distributorStatusLabel(lang, r.distributor.status)}
                      />
                    </td>
                    <td className="px-4 py-3 text-meta tabular-nums text-gray-600 dark:text-white/65">
                      {fmtRelative(lang, r.distributor.lastSeenAt)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <MetricCell
                        value={r.latest.cpuTempC}
                        format={(v) => `${v.toFixed(0)}°C`}
                        tone={r.latest.cpuTempC != null && r.latest.cpuTempC > 75 ? 'bad' : 'neutral'}
                        nullLabel={t.noDataShort}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <MetricCell
                        value={r.latest.rssiDbm}
                        format={(v) => `${v} dBm`}
                        tone={r.latest.rssiDbm != null && r.latest.rssiDbm < -80 ? 'bad' : 'neutral'}
                        nullLabel={t.noDataShort}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <MetricCell
                        value={r.latest.freeMemMb}
                        format={(v) => `${v} Mo`}
                        tone={r.latest.freeMemMb != null && r.latest.freeMemMb < 64 ? 'bad' : 'neutral'}
                        nullLabel={t.noDataShort}
                      />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={cn(
                        r.criticalTickets > 0
                          ? 'text-rose-700 font-semibold dark:text-rose-300'
                          : r.openTickets > 0
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-gray-400 dark:text-white/30',
                      )}>
                        {r.openTickets}
                        {r.criticalTickets > 0 && (
                          <span className="ml-1 text-meta">({r.criticalTickets})</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.alerts.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-meta text-emerald-700 dark:text-emerald-300/80">
                          <CheckCircle2 className="h-3 w-3" />
                          OK
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.alerts.map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200"
                              title={a}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {alertLabel(lang, a)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/distributors/${r.distributor.id}/health`}
                        className="text-xs text-emerald-700 transition-colors duration-base hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
                      >
                        {t.detail}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-meta text-gray-500 dark:text-white/40">{t.thresholdsHelp}</p>
    </div>
  )
}

function FilterTabs({
  current,
  lang,
}: {
  current: 'all' | 'alerts'
  lang: 'fr' | 'en'
}) {
  const t = healthStrings(lang)
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 bg-white text-sm dark:border-white/15 dark:bg-navy-800">
      <Link
        href="/health"
        className={cn(
          'px-3 py-1.5 transition',
          current === 'all'
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
            : 'text-gray-600 hover:bg-gray-50 dark:text-white/60 dark:hover:bg-white/[0.04]',
        )}
      >
        {t.filterAll}
      </Link>
      <Link
        href="/health?filter=alerts"
        className={cn(
          'px-3 py-1.5 transition border-l border-gray-300 dark:border-white/10',
          current === 'alerts'
            ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200'
            : 'text-gray-600 hover:bg-gray-50 dark:text-white/60 dark:hover:bg-white/[0.04]',
        )}
      >
        {t.filterWithAlerts}
      </Link>
    </div>
  )
}

function MetricCell({
  value,
  format,
  tone,
  nullLabel,
}: {
  value: number | null
  format: (v: number) => string
  tone: 'neutral' | 'bad'
  nullLabel: string
}) {
  if (value == null) {
    return <span className="text-gray-400 dark:text-white/30">{nullLabel}</span>
  }
  return (
    <span className={cn(
      tone === 'bad'
        ? 'text-rose-700 font-semibold dark:text-rose-300'
        : 'text-navy-900 dark:text-white/80',
    )}>
      {format(value)}
    </span>
  )
}
