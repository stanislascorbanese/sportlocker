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

/** Calcule from/to UTC selon le preset. Toute date est en YYYY-MM-DD. */
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
    // Garde-fou : from ≤ to, sinon on bascule sur 30j.
    if (params.from <= params.to) {
      return { from: params.from, to: params.to, preset: 'custom' }
    }
  }
  // last30 par défaut (inclusif : aujourd'hui − 29j ... aujourd'hui)
  const from = new Date(today.getTime() - 29 * 24 * 3600 * 1000)
  return { from: toIsoDate(from), to: toIso, preset: 'last30' }
}

/** Nombre de jours entre from et to (inclusif). Utile pour borner l'appel API. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((b - a) / (24 * 3600 * 1000)) + 1)
}

/** Restreint la série daily aux jours [from..to] inclus. */
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
  const { from, to, preset } = resolvePeriod(params)
  const days = daysBetween(from, to)

  // Pour l'aperçu sparkline 30 derniers jours, on tire toujours sur min 30j.
  const fetchDays = Math.max(30, days)
  const data = await loadAll(fetchDays)

  const user = await getSessionUser()

  // Restriction commune pour l'admin tenant — pour le contexte UI seulement.
  const commune = user?.role === 'admin' && user.communeId
    ? data.communes.find((c) => c.id === user.communeId) ?? null
    : null

  const scopedStats = scopeDaily(data.stats, from, to)
  const total       = scopedStats.daily.reduce((a, p) => a + p.count, 0)
  const returned    = scopedStats.byStatus.find((s) => s.status === 'returned')?.count ?? 0
  const overdue     = scopedStats.byStatus.find((s) => s.status === 'overdue')?.count ?? 0
  const active      = scopedStats.byStatus.find((s) => s.status === 'active')?.count ?? 0
  const completion  = total > 0 ? Math.round((returned / total) * 100) : 0
  const openTickets = data.tickets.length
  const distCount   = data.distributors.length

  // Occupation moyenne — proxy : (lockerCount − idle) / lockerCount, agrégé.
  const totalLockers = data.distributors.reduce((a, d) => a + d.lockerCount, 0)
  const totalIdle    = data.distributors.reduce((a, d) => a + d.idleLockers, 0)
  const occupancy = totalLockers > 0
    ? Math.round(100 * (totalLockers - totalIdle) / totalLockers)
    : null

  // Aperçu sparkline 30j (sur la fenêtre complète chargée), zoomé visuel sur period via Sparkline.
  const sparkSeries = data.stats.daily // 30+ derniers jours, série globale
  const periodSpark = scopedStats.daily

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl">Rapports</h2>
            {data.useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {commune ? `${commune.name} · ` : 'Vue globale · '}
            {formatDateFr(from)} → {formatDateFr(to)} · {days} jour{days > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <DownloadPdfButton filters={{ from, to }} />
        </div>
      </header>

      {data.fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{data.fetchError}</p>
        </div>
      )}

      {/* Sélecteur de période */}
      <PeriodSelector preset={preset} from={from} to={to} />

      {/* Aperçu KPIs */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Réservations totales"
          value={total}
          hint="sur la période choisie"
          tone="neutral"
        />
        <StatCard
          label="Achevées"
          value={returned}
          hint={`${completion}% du total`}
          tone="good"
        />
        <StatCard
          label="En retard"
          value={overdue}
          hint={total > 0 ? `${Math.round((overdue / total) * 100)}% du total` : '—'}
          tone={overdue > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Taux d'achèvement"
          value={`${completion}%`}
          hint={`${active} actives en parallèle`}
          tone={completion >= 80 ? 'good' : completion >= 60 ? 'warn' : 'bad'}
        />
        <StatCard
          label="Tickets ouverts"
          value={openTickets}
          hint="maintenance en cours"
          tone={openTickets > 0 ? 'warn' : 'good'}
        />
        <StatCard
          label="Distributeurs actifs"
          value={distCount}
          hint={commune ? `sur ${commune.name}` : 'tout le parc'}
          tone="neutral"
        />
        <StatCard
          label="Occupation moyenne"
          value={occupancy !== null ? `${occupancy}%` : '—'}
          hint={`${totalLockers - totalIdle} / ${totalLockers} casiers occupés`}
          tone={occupancy !== null && occupancy > 80 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="Pic horaire"
          value={scopedStats.hourly.length > 0 ? Math.max(...scopedStats.hourly.map((h) => h.count)) : 0}
          hint="réservations / heure / jour"
          tone="neutral"
        />
      </section>

      {/* Sparkline 30j zoomé sur la période */}
      <section className="rounded-xl border border-white/10 bg-navy-800 p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Tendance · réservations / jour
          </h3>
          <span className="text-[11px] text-white/40">période choisie</span>
        </div>
        <Sparkline
          points={periodSpark.length > 0 ? periodSpark : sparkSeries.slice(-30)}
          width={Math.min(1200, 120 + Math.max(periodSpark.length, 30) * 28)}
        />
      </section>

      {/* Top distributeurs + top articles */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            Top 5 distributeurs
          </h3>
          <TopList items={scopedStats.topDistributors.slice(0, 5).map((d) => ({
            primary: d.name,
            secondary: d.serialNumber,
            count: d.count,
          }))} />
        </div>
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/40">
            Top 5 articles
          </h3>
          <TopList items={scopedStats.topItemTypes.slice(0, 5).map((t) => ({
            primary: t.name,
            count: t.count,
          }))} />
        </div>
      </section>

      {/* Heatmap */}
      <section className="rounded-xl border border-white/10 bg-navy-800 p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Heures de pointe · jour de semaine × heure
          </h3>
          <span className="text-[11px] text-white/40">agrégé sur la période</span>
        </div>
        <Heatmap points={scopedStats.hourly} />
      </section>

      <p className="text-[11px] text-white/40">
        Le bouton « Télécharger PDF » génère un rapport synthétique à transmettre au
        conseil municipal — entête commune, chiffres clés, top distributeurs &amp; articles.
      </p>
    </div>
  )
}

function PeriodSelector({ preset, from, to }: { preset: Preset; from: string; to: string }) {
  const presets: Array<{ key: Preset; label: string; href: string }> = [
    { key: 'last30',     label: '30 derniers jours', href: '/reports?preset=last30' },
    { key: 'this_month', label: 'Mois en cours',     href: '/reports?preset=this_month' },
    { key: 'last_month', label: 'Mois précédent',    href: '/reports?preset=last_month' },
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
          <span className="text-[10px] uppercase tracking-wider text-white/40">Du</span>
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="rounded-md border border-white/15 bg-navy-900 px-2 py-1 text-sm text-white outline-none focus:border-emerald-400/60"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Au</span>
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
          Appliquer
        </button>
      </form>
    </section>
  )
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
