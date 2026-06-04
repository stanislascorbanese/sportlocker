import Link from 'next/link'

import {
  fetchCommunes,
  fetchDistributors,
  fetchMaintenanceTickets,
  fetchStatsDashboard,
  type Commune,
  type Distributor,
  type MaintenanceTicket,
  type StatsDashboard,
} from '../../lib/api'
import {
  DEMO_COMMUNES,
  DEMO_MAINTENANCE_TICKETS,
  demoStatsDashboard,
} from '../../lib/demo-data'
import { getSessionUser } from '../../lib/session-server'
import { Heatmap } from '../../components/Heatmap'
import { RefreshButton } from '../../components/RefreshButton'
import { Sparkline } from '../../components/Sparkline'
import { StatCard } from '../../components/StatCard'
import { TopList } from '../../components/TopList'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import type { Lang } from '../../lib/lang'
import { commonStrings, fmtDateShort } from '../../lib/i18n/common'
import { reportsStrings } from '../../lib/i18n/reports'

import { DownloadPdfButton } from './DownloadPdfButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Rapports · SportLocker ops' }

type Preset = 'last30' | 'this_month' | 'last_month' | 'custom'

type SearchParams = {
  preset?: string
  from?: string
  to?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolvePeriod(params: SearchParams): { from: string; to: string; preset: Preset } {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const toIso = toIsoDate(today)

  if (params.preset === 'this_month') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return { from: toIsoDate(first), to: toIso, preset: 'this_month' }
  }
  if (params.preset === 'last_month') {
    const firstThis = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    const lastPrev = new Date(firstThis.getTime() - 24 * 3600 * 1000)
    const firstPrev = new Date(Date.UTC(lastPrev.getUTCFullYear(), lastPrev.getUTCMonth(), 1))
    return { from: toIsoDate(firstPrev), to: toIsoDate(lastPrev), preset: 'last_month' }
  }
  if (params.from && params.to && DATE_RE.test(params.from) && DATE_RE.test(params.to)) {
    if (params.from <= params.to) {
      return { from: params.from, to: params.to, preset: 'custom' }
    }
  }
  const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000)
  return { from: toIsoDate(from), to: toIso, preset: 'last30' }
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / (24 * 3600 * 1000)) + 1)
}

function scopeDaily(stats: StatsDashboard, from: string, to: string): StatsDashboard {
  return { ...stats, daily: stats.daily.filter((p) => p.date >= from && p.date <= to) }
}

type LoadResult = {
  stats: StatsDashboard
  distributors: Distributor[]
  tickets: MaintenanceTicket[]
  communes: Commune[]
  useDemo: boolean
  fetchError: string | null
}

async function loadAll(days: number): Promise<LoadResult> {
  let realStats: StatsDashboard | null = null
  let distributors: Distributor[] = []
  let tickets: MaintenanceTicket[] = []
  let communes: Commune[] = []
  let fetchError: string | null = null

  try {
    realStats = await fetchStatsDashboard(days)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { return fallback }
  }
  ;[distributors, tickets, communes] = await Promise.all([
    safe(fetchDistributors(), []),
    safe(fetchMaintenanceTickets({ status: 'open' }), []),
    safe(fetchCommunes(), []),
  ])

  const allZero = realStats !== null
    && realStats.daily.every((p) => p.count === 0)
    && realStats.topDistributors.every((d) => d.count === 0)
  const useDemo = fetchError !== null || realStats === null || allZero

  const stats: StatsDashboard = useDemo ? demoStatsDashboard(days) : realStats!
  if (useDemo) {
    if (communes.length === 0) communes = DEMO_COMMUNES
    if (tickets.length === 0) tickets = DEMO_MAINTENANCE_TICKETS.filter((t) => t.status === 'open')
  }

  return { stats, distributors, tickets, communes, useDemo, fetchError }
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const lang = await getLang()
  const t = reportsStrings(lang)
  const c = commonStrings(lang)

  const { from, to, preset } = resolvePeriod(params)
  const days = daysBetween(from, to)

  const fetchDays = Math.max(30, days)
  const data = await loadAll(fetchDays)

  const user = await getSessionUser()

  const commune = user?.role === 'admin' && user.communeId
    ? data.communes.find((co) => co.id === user.communeId) ?? null
    : null

  const scopedStats = scopeDaily(data.stats, from, to)
  const total       = scopedStats.daily.reduce((a, p) => a + p.count, 0)
  const returned    = scopedStats.byStatus.find((s) => s.status === 'returned')?.count ?? 0
  const overdue     = scopedStats.byStatus.find((s) => s.status === 'overdue')?.count ?? 0
  const active      = scopedStats.byStatus.find((s) => s.status === 'active')?.count ?? 0
  const completion  = total > 0 ? Math.round((returned / total) * 100) : 0
  const openTickets = data.tickets.length
  const distCount   = data.distributors.length

  const totalLockers = data.distributors.reduce((a, d) => a + d.lockerCount, 0)
  const totalIdle    = data.distributors.reduce((a, d) => a + d.idleLockers, 0)
  const occupancy = totalLockers > 0
    ? Math.round(100 * (totalLockers - totalIdle) / totalLockers)
    : null

  const sparkSeries = data.stats.daily
  const periodSpark = scopedStats.daily

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl">{t.pageTitle}</h2>
            {data.useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {commune ? `${commune.name} · ` : `${t.globalView} · `}
            {fmtDateShort(lang, `${from}T00:00:00Z`)} → {fmtDateShort(lang, `${to}T00:00:00Z`)} · {days} {days > 1 ? t.dayMany : t.day1}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <DownloadPdfButton filters={{ from, to }} lang={lang} />
        </div>
      </header>

      {data.fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{data.fetchError}</p>
        </div>
      )}

      <PeriodSelector preset={preset} from={from} to={to} lang={lang} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.kpiTotal}
          value={total}
          hint={t.kpiTotalHint}
          tone="neutral"
        />
        <StatCard
          label={t.kpiCompleted}
          value={returned}
          hint={t.kpiCompletedHint.replace('%d', String(completion))}
          tone="good"
        />
        <StatCard
          label={t.kpiOverdue}
          value={overdue}
          hint={total > 0 ? t.kpiOverdueHint.replace('%d', String(Math.round((overdue / total) * 100))) : '—'}
          tone={overdue > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label={t.kpiCompletionRate}
          value={`${completion}%`}
          hint={t.kpiCompletionRateHint.replace('%d', String(active))}
          tone={completion >= 80 ? 'good' : completion >= 60 ? 'warn' : 'bad'}
        />
        <StatCard
          label={t.kpiOpenTickets}
          value={openTickets}
          hint={t.kpiOpenTicketsHint}
          tone={openTickets > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label={t.kpiActiveDistributors}
          value={distCount}
          hint={commune ? `${t.kpiActiveDistributorsOn} ${commune.name}` : t.kpiActiveDistributorsHint}
          tone="neutral"
        />
        <StatCard
          label={t.kpiAvgOccupancy}
          value={occupancy !== null ? `${occupancy}%` : '—'}
          hint={t.kpiAvgOccupancyHint
            .replace('%a', String(totalLockers - totalIdle))
            .replace('%b', String(totalLockers))}
          tone={occupancy !== null && occupancy > 80 ? 'warn' : 'neutral'}
        />
        <StatCard
          label={t.kpiHourPeak}
          value={scopedStats.hourly.length > 0 ? Math.max(...scopedStats.hourly.map((h) => h.count)) : 0}
          hint={t.kpiHourPeakHint}
          tone="neutral"
        />
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-800 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.trendTitle}
          </h3>
          <span className="text-[11px] text-white/40">{t.trendSub}</span>
        </div>
        <Sparkline
          points={periodSpark.length > 0 ? periodSpark : sparkSeries.slice(-30)}
          width={Math.min(1200, 120 + Math.max(periodSpark.length, 30) * 28)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.topDistributors}
          </h3>
          <TopList items={scopedStats.topDistributors.slice(0, 5).map((d) => ({
            primary: d.name,
            secondary: d.serialNumber,
            count: d.count,
          }))} />
        </div>
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.topItemTypes}
          </h3>
          <TopList items={scopedStats.topItemTypes.slice(0, 5).map((it) => ({
            primary: it.name,
            count: it.count,
          }))} />
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-800 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.heatmapTitle}
          </h3>
          <span className="text-[11px] text-white/40">{t.heatmapSub}</span>
        </div>
        <Heatmap points={scopedStats.hourly} />
      </section>

      <p className="text-[11px] text-white/40">{t.pdfHint}</p>
    </div>
  )
}

function PeriodSelector({
  preset,
  from,
  to,
  lang,
}: {
  preset: Preset
  from: string
  to: string
  lang: Lang
}) {
  const t = reportsStrings(lang)
  const c = commonStrings(lang)
  const presets: Array<{ key: Preset; label: string; href: string }> = [
    { key: 'last30',     label: t.preset30d,         href: '/reports?preset=last30' },
    { key: 'this_month', label: t.presetThisMonth,   href: '/reports?preset=this_month' },
    { key: 'last_month', label: t.presetLastMonth,   href: '/reports?preset=last_month' },
  ]
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-white/10 bg-navy-800 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link
            key={p.key}
            href={p.href}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition',
              p.key === preset
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/10 bg-white/[0.02] text-white/65 hover:border-white/25 hover:text-white',
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form
        action="/reports"
        method="get"
        className="flex flex-wrap items-end gap-2 text-xs text-white/60"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">{c.from}</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-white/15 bg-navy-900 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">{c.to}</span>
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="rounded-md border border-white/15 bg-navy-900 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80 transition hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-200"
        >
          {t.apply}
        </button>
      </form>
    </section>
  )
}
