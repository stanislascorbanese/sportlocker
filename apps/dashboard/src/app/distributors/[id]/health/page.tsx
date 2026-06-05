import Link from 'next/link'
import { notFound } from 'next/navigation'

import { fetchDistributorHealth, type DistributorHealth } from '../../../../lib/api'
import { getLang } from '../../../../lib/lang-server'
import type { Lang } from '../../../../lib/lang'
import { distributorStatusLabel, fmtRelative } from '../../../../lib/i18n/common'
import { healthStrings } from '../../../../lib/i18n/health'
import { StatusPill } from '../../../../components/StatusPill'
import { StatCard } from '../../../../components/StatCard'
import { RefreshButton } from '../../../../components/RefreshButton'
import { MetricChart, type MetricPoint } from '../../../../components/MetricChart'
import { cn } from '../../../../lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Santé distributeur · SportLocker ops' }

const WINDOW_HOURS = [24, 72, 168] as const

function fmtUptime(lang: Lang, seconds: number | null): string {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3600)
  if (d > 0) return `${d}${lang === 'fr' ? 'j' : 'd'} ${h}h`
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}min`
}

/** Le distributeur est-il "vivant" ? Dernier signe < 10 min. */
function isStale(iso: string | null): boolean {
  if (!iso) return true
  return Date.now() - new Date(iso).getTime() > 10 * 60 * 1000
}

function availabilityTone(pct: number | null): 'good' | 'warn' | 'bad' | 'neutral' {
  if (pct == null) return 'neutral'
  if (pct >= 95) return 'good'
  if (pct >= 80) return 'warn'
  return 'bad'
}

function windowLabel(lang: Lang, hours: number): string {
  const t = healthStrings(lang)
  return hours < 24
    ? t.windowHoursShort.replace('%d', String(hours))
    : t.windowDaysShort.replace('%d', String(Math.round(hours / 24)))
}

export default async function DistributorHealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ hours?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const lang = await getLang()
  const t = healthStrings(lang)
  const hours = (WINDOW_HOURS as readonly number[]).includes(Number(sp.hours)) ? Number(sp.hours) : 24

  const windows = [
    { hours: 24, label: t.windowSelect24h },
    { hours: 72, label: t.windowSelect3d },
    { hours: 168, label: t.windowSelect7d },
  ]

  let health: DistributorHealth
  try {
    health = await fetchDistributorHealth(id, hours)
  } catch (err) {
    if (err instanceof Error && err.message === 'distributor_not_found') notFound()
    throw err
  }

  const { distributor: d, summary, latest, series } = health
  const stale = isStale(d.lastSeenAt)
  const periodLabel = windowLabel(lang, hours)
  const memUnit = lang === 'fr' ? ' Mo' : ' MB'

  const cpuPoints: MetricPoint[] = series.map((p) => ({ t: p.bucket, value: p.avgCpuTempC }))
  const rssiPoints: MetricPoint[] = series.map((p) => ({ t: p.bucket, value: p.avgRssiDbm }))
  const memPoints: MetricPoint[] = series.map((p) => ({ t: p.bucket, value: p.avgFreeMemMb }))

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-3xl">{d.name}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/55">
            <span className="font-mono text-xs">{d.serialNumber}</span>
            <StatusPill status={d.status} label={distributorStatusLabel(lang, d.status)} />
            <span className={cn('inline-flex items-center gap-1.5', stale ? 'text-rose-300' : 'text-emerald-300')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', stale ? 'bg-rose-400' : 'bg-emerald-400')} />
              {stale ? t.silent : t.live} · {t.seen} {fmtRelative(lang, d.lastSeenAt)}
            </span>
            {d.firmwareVersion && (
              <span className="font-mono text-xs text-white/40">{t.fwShort} {d.firmwareVersion}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link href={`/distributors/${id}/edit`} className="text-sm text-white/60 transition hover:text-white">
            {t.btnEdit}
          </Link>
          <Link href="/distributors" className="text-sm text-white/60 transition hover:text-white">
            {t.btnBackToFleet}
          </Link>
        </div>
      </header>

      {/* Sélecteur de fenêtre */}
      <div className="flex items-center gap-1.5">
        {windows.map((w) => (
          <Link
            key={w.hours}
            href={`/distributors/${id}/health?hours=${w.hours}`}
            className={cn(
              'rounded-lg border px-3 py-1 text-xs transition',
              w.hours === hours
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 text-white/55 hover:border-white/30 hover:text-white',
            )}
          >
            {w.label}
          </Link>
        ))}
      </div>

      {summary.heartbeatCount === 0 ? (
        <div className="rounded-xl border border-white/10 bg-navy-800 p-8 text-center text-sm text-white/55">
          {t.noHeartbeat.replace('%p', periodLabel)}
          <p className="mt-1 text-xs text-white/40">{t.noHeartbeatHint}</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t.kpiAvailability}
              value={summary.availabilityPct == null ? '—' : `${summary.availabilityPct}%`}
              hint={t.kpiAvailabilityHint.replace('%p', periodLabel)}
              tone={availabilityTone(summary.availabilityPct)}
            />
            <StatCard
              label={t.kpiCpu}
              value={latest?.cpuTempC != null ? `${latest.cpuTempC.toFixed(1)}°C` : '—'}
              hint={summary.maxCpuTempC != null
                ? t.kpiCpuHintMax.replace('%s', `${summary.maxCpuTempC.toFixed(1)}°C`)
                : t.kpiNoMeasure}
              tone={latest?.cpuTempC != null && latest.cpuTempC >= 75 ? 'bad' : latest?.cpuTempC != null && latest.cpuTempC >= 65 ? 'warn' : 'neutral'}
            />
            <StatCard
              label={t.kpiSignal}
              value={latest?.rssiDbm != null ? `${latest.rssiDbm} dBm` : '—'}
              hint={summary.avgRssiDbm != null
                ? t.kpiSignalHintAvg.replace('%s', `${Math.round(summary.avgRssiDbm)} dBm`)
                : t.kpiNoMeasure}
              tone={latest?.rssiDbm != null && latest.rssiDbm <= -85 ? 'bad' : latest?.rssiDbm != null && latest.rssiDbm <= -75 ? 'warn' : 'neutral'}
            />
            <StatCard
              label={t.kpiMemory}
              value={latest?.freeMemMb != null ? `${latest.freeMemMb}${memUnit}` : '—'}
              hint={summary.minFreeMemMb != null
                ? t.kpiMemoryHintMin.replace('%s', `${summary.minFreeMemMb}${memUnit}`)
                : t.kpiNoMeasure}
              tone={latest?.freeMemMb != null && latest.freeMemMb <= 64 ? 'bad' : latest?.freeMemMb != null && latest.freeMemMb <= 128 ? 'warn' : 'neutral'}
            />
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/45">
            <span>{t.heartbeatsReceived.replace('%d', String(summary.heartbeatCount))}</span>
            <span>{t.uptimeLabel} {fmtUptime(lang, latest?.uptimeSeconds ?? null)}</span>
            {latest && <span>{t.lastPacket} {fmtRelative(lang, latest.receivedAt)}</span>}
          </div>

          {/* Courbes */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {t.telemetryTitle}
            </h3>
            <div className="grid gap-4 lg:grid-cols-3">
              <MetricChart
                label={t.chartCpu} points={cpuPoints} unit="°C" tone="amber" decimals={1}
                emptyLabel={t.metricNoData} minLabel={t.metricMin} maxLabel={t.metricMax}
              />
              <MetricChart
                label={t.chartRssi} points={rssiPoints} unit=" dBm" tone="sky" decimals={0}
                emptyLabel={t.metricNoData} minLabel={t.metricMin} maxLabel={t.metricMax}
              />
              <MetricChart
                label={t.chartMemory} points={memPoints} unit={memUnit} tone="emerald" decimals={0}
                emptyLabel={t.metricNoData} minLabel={t.metricMin} maxLabel={t.metricMax}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
