import Link from 'next/link'
import { notFound } from 'next/navigation'

import { fetchDistributorHealth, type DistributorHealth } from '../../../../lib/api'
import { getLang } from '../../../../lib/lang-server'
import { distributorStatusLabel } from '../../../../lib/i18n/common'
import { StatusPill } from '../../../../components/StatusPill'
import { StatCard } from '../../../../components/StatCard'
import { RefreshButton } from '../../../../components/RefreshButton'
import { MetricChart, type MetricPoint } from '../../../../components/MetricChart'
import { cn } from '../../../../lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Santé distributeur · SportLocker ops' }

const WINDOWS: Array<{ hours: number; label: string }> = [
  { hours: 24, label: '24 h' },
  { hours: 72, label: '3 j' },
  { hours: 168, label: '7 j' },
]

function fmtRelative(iso: string | null): string {
  if (!iso) return 'jamais'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
}

function fmtUptime(seconds: number | null): string {
  if (seconds == null) return '—'
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3600)
  if (d > 0) return `${d}j ${h}h`
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
  const hours = WINDOWS.some((w) => String(w.hours) === sp.hours) ? Number(sp.hours) : 24

  let health: DistributorHealth
  try {
    health = await fetchDistributorHealth(id, hours)
  } catch (err) {
    if (err instanceof Error && err.message === 'distributor_not_found') notFound()
    throw err
  }

  const { distributor: d, summary, latest, series } = health
  const stale = isStale(d.lastSeenAt)

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
              {stale ? 'silencieux' : 'en ligne'} · vu {fmtRelative(d.lastSeenAt)}
            </span>
            {d.firmwareVersion && <span className="font-mono text-xs text-white/40">fw {d.firmwareVersion}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link href={`/distributors/${id}/edit`} className="text-sm text-white/60 transition hover:text-white">
            Modifier
          </Link>
          <Link href="/distributors" className="text-sm text-white/60 transition hover:text-white">
            ← Parc
          </Link>
        </div>
      </header>

      {/* Sélecteur de fenêtre */}
      <div className="flex items-center gap-1.5">
        {WINDOWS.map((w) => (
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
          Aucun heartbeat reçu sur les {hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} j`} écoulés.
          <p className="mt-1 text-xs text-white/40">
            Le firmware n&apos;a rien publié — distributeur hors-ligne, ou pas encore appairé.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Disponibilité"
              value={summary.availabilityPct == null ? '—' : `${summary.availabilityPct}%`}
              hint={`sur ${hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} j`} · tranches de 5 min`}
              tone={availabilityTone(summary.availabilityPct)}
            />
            <StatCard
              label="Température CPU"
              value={latest?.cpuTempC != null ? `${latest.cpuTempC.toFixed(1)}°C` : '—'}
              hint={summary.maxCpuTempC != null ? `max ${summary.maxCpuTempC.toFixed(1)}°C` : 'pas de mesure'}
              tone={latest?.cpuTempC != null && latest.cpuTempC >= 75 ? 'bad' : latest?.cpuTempC != null && latest.cpuTempC >= 65 ? 'warn' : 'neutral'}
            />
            <StatCard
              label="Signal réseau"
              value={latest?.rssiDbm != null ? `${latest.rssiDbm} dBm` : '—'}
              hint={summary.avgRssiDbm != null ? `moy. ${Math.round(summary.avgRssiDbm)} dBm` : 'pas de mesure'}
              tone={latest?.rssiDbm != null && latest.rssiDbm <= -85 ? 'bad' : latest?.rssiDbm != null && latest.rssiDbm <= -75 ? 'warn' : 'neutral'}
            />
            <StatCard
              label="Mémoire libre"
              value={latest?.freeMemMb != null ? `${latest.freeMemMb} Mo` : '—'}
              hint={summary.minFreeMemMb != null ? `min ${summary.minFreeMemMb} Mo` : 'pas de mesure'}
              tone={latest?.freeMemMb != null && latest.freeMemMb <= 64 ? 'bad' : latest?.freeMemMb != null && latest.freeMemMb <= 128 ? 'warn' : 'neutral'}
            />
          </section>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/45">
            <span>{summary.heartbeatCount} heartbeats reçus</span>
            <span>uptime {fmtUptime(latest?.uptimeSeconds ?? null)}</span>
            {latest && <span>dernier paquet {fmtRelative(latest.receivedAt)}</span>}
          </div>

          {/* Courbes */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Télémétrie · moyenne horaire
            </h3>
            <div className="grid gap-4 lg:grid-cols-3">
              <MetricChart label="Température CPU" points={cpuPoints} unit="°C" tone="amber" decimals={1} />
              <MetricChart label="Signal (RSSI)" points={rssiPoints} unit=" dBm" tone="sky" decimals={0} />
              <MetricChart label="Mémoire libre" points={memPoints} unit=" Mo" tone="emerald" decimals={0} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
