import Link from 'next/link'

import { fetchStatsDashboard, type StatsDashboard, type ReservationStatus } from '../../lib/api'
import { demoStatsDashboard } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { Sparkline } from '../../components/Sparkline'
import { DonutChart } from '../../components/DonutChart'
import { Heatmap } from '../../components/Heatmap'
import { TopList } from '../../components/TopList'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { statsStrings, reservationStatusLabel } from '../../lib/i18n/stats'
import { makeMetadata } from '../../lib/i18n/metadata'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => statsStrings(lang).metaTitle)

const STATUS_COLOR: Record<ReservationStatus, string> = {
  scheduled: '#a78bfa',  // violet-400
  pending:   '#38bdf8',  // sky-400
  active:    '#34d399',  // emerald-400
  returned:  '#a1a1aa',  // zinc-400
  overdue:   '#fb7185',  // rose-400
  cancelled: '#52525b',  // zinc-600
  expired:   '#fbbf24',  // amber-400
}

const RANGES = [7, 30, 90] as const
type Range = typeof RANGES[number]

type SearchParams = { days?: string }

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const lang = await getLang()
  const t = statsStrings(lang)
  const c = commonStrings(lang)

  const requested = Number(params.days)
  const days: Range = (RANGES as readonly number[]).includes(requested)
    ? (requested as Range)
    : 30

  let real: StatsDashboard | null = null
  let fetchError: string | null = null
  try {
    real = await fetchStatsDashboard(days)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const everythingEmpty = real
    && real.daily.reduce((a, p) => a + p.count, 0) === 0
    && real.topDistributors.every((d) => d.count === 0)
  const useDemo = fetchError !== null || !real || everythingEmpty

  const stats: StatsDashboard = useDemo ? demoStatsDashboard(days) : real!

  const total = stats.daily.reduce((a, p) => a + p.count, 0)
  const totalReturned = stats.byStatus.find((s) => s.status === 'returned')?.count ?? 0
  const totalActive = stats.byStatus.find((s) => s.status === 'active')?.count ?? 0
  const totalOverdue = stats.byStatus.find((s) => s.status === 'overdue')?.count ?? 0

  const donutSlices = stats.byStatus
    .filter((s) => s.count > 0)
    .map((s) => ({
      label: reservationStatusLabel(lang, s.status),
      value: s.count,
      color: STATUS_COLOR[s.status],
    }))

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">{t.pageTitle}</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {total} {t.subtitleN} {t.subtitleDays.replace('%d', String(days))} · {t.subtitleCompletionRate}{' '}
            <span className="text-emerald-300">
              {total > 0 ? Math.round((totalReturned / total) * 100) : 0}%
            </span>
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-white/15 bg-navy-800 text-sm">
            {RANGES.map((d) => (
              <Link
                key={d}
                href={`/stats?days=${d}`}
                className={cn(
                  'px-3 py-1.5 transition',
                  d === days
                    ? 'bg-emerald-500/15 text-emerald-200'
                    : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
                )}
              >
                {d}{lang === 'fr' ? 'j' : 'd'}
              </Link>
            ))}
          </div>
          <RefreshButton />
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {/* Sparkline large */}
      <section className="rounded-xl border border-white/10 bg-navy-800 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.trendTitle}
          </h3>
          <span className="text-[11px] text-white/40">{t.trendSub.replace('%d', String(days))}</span>
        </div>
        <div className="overflow-x-auto">
          <Sparkline points={stats.daily} width={Math.min(1200, 120 + stats.daily.length * 30)} lang={lang} />
        </div>
      </section>

      {/* Trois blocs en grid : donut + tops empilés sur mobile */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.statusBreakdown}
          </h3>
          <DonutChart
            slices={donutSlices}
            centerValue={total}
            centerLabel={t.centerLabel}
          />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3 text-[11px]">
            <Stat label={t.statActives} value={totalActive} tone="good" />
            <Stat label={t.statOverdue} value={totalOverdue} tone="bad" />
            <Stat label={t.statReturned} value={totalReturned} tone="neutral" />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.topDistributors}
          </h3>
          <TopList items={stats.topDistributors.map((d) => ({
            primary: d.name,
            secondary: d.serialNumber,
            count: d.count,
          }))} />
        </div>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.topItemTypes}
          </h3>
          <TopList items={stats.topItemTypes.map((tp) => ({
            primary: tp.name,
            count: tp.count,
          }))} />
        </div>
      </section>

      {/* Heatmap heures × jours */}
      <section className="rounded-xl border border-white/10 bg-navy-800 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {t.heatmapTitle}
          </h3>
          <span className="text-[11px] text-white/40">
            {t.heatmapSub.replace('%d', String(days))}
          </span>
        </div>
        <Heatmap points={stats.hourly} lang={lang} />
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-white/80'
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={cn('mt-0.5 font-display text-lg tabular-nums', color)}>{value}</div>
    </div>
  )
}
