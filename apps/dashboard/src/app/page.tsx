import Link from 'next/link'

import {
  fetchDistributors,
  fetchMaintenanceTickets,
  fetchReservations,
  fetchReservationsDaily,
  type DailyPoint,
  type Distributor,
  type MaintenanceTicket,
  type Reservation,
} from '../lib/api'
import {
  DEMO_RESERVATIONS,
  DEMO_MAINTENANCE_TICKETS,
  demoReservationsDaily,
} from '../lib/demo-data'
import { getSessionUser } from '../lib/session-server'
import { RefreshButton } from '../components/RefreshButton'
import { Sparkline } from '../components/Sparkline'
import { StatCard } from '../components/StatCard'
import { cn } from '../lib/cn'
import { TenantHome } from './_TenantHome'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Accueil · SportLocker ops' }

const SEVERITY_STYLE: Record<number, string> = {
  1: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
  2: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  3: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  4: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  5: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}

function fmtRelative(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
}

type FetchResults = {
  distributors: Distributor[]
  activeReservations: Reservation[]
  overdueReservations: Reservation[]
  openTickets: MaintenanceTicket[]
  dailySeries: DailyPoint[]
  hadError: boolean
}

async function loadAll(): Promise<FetchResults> {
  let distributors: Distributor[] = []
  let activeReservations: Reservation[] = []
  let overdueReservations: Reservation[] = []
  let openTickets: MaintenanceTicket[] = []
  let dailySeries: DailyPoint[] = []
  let hadError = false

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { hadError = true; return fallback }
  }

  ;[distributors, activeReservations, overdueReservations, openTickets, dailySeries] = await Promise.all([
    safe(fetchDistributors(), []),
    safe(fetchReservations({ status: 'active', limit: 100 }).then((p) => p.items), []),
    safe(fetchReservations({ status: 'overdue', limit: 50 }).then((p) => p.items), []),
    safe(fetchMaintenanceTickets({ status: 'open' }), []),
    safe(fetchReservationsDaily(7), []),
  ])

  return { distributors, activeReservations, overdueReservations, openTickets, dailySeries, hadError }
}

export default async function HomePage() {
  // Dispatch role-based : un admin tenant (role=admin avec communeId) voit
  // une home dédiée centrée sur sa commune. Un super_admin garde la vue
  // parc globale ci-dessous.
  const user = await getSessionUser()
  if (user?.role === 'admin' && user.communeId) {
    return <TenantHome communeId={user.communeId} />
  }

  const data = await loadAll()

  // Mode démo si l'API admin a planté OU si tout est vide (table neuve)
  const everythingEmpty = data.distributors.length === 0
    && data.activeReservations.length === 0
    && data.overdueReservations.length === 0
    && data.openTickets.length === 0
  const useDemo = data.hadError || everythingEmpty

  const activeReservations = useDemo
    ? DEMO_RESERVATIONS.filter((r) => r.status === 'active')
    : data.activeReservations
  const overdueReservations = useDemo
    ? DEMO_RESERVATIONS.filter((r) => r.status === 'overdue')
    : data.overdueReservations
  const openTickets = useDemo
    ? DEMO_MAINTENANCE_TICKETS.filter((t) => t.status === 'open')
    : data.openTickets
  const dailySeries = useDemo || data.dailySeries.length === 0
    ? demoReservationsDaily(7)
    : data.dailySeries

  // KPIs distributeurs (toujours via vraies données — la route est publique)
  const totalDistributors  = data.distributors.length
  const onlineDistributors = data.distributors.filter((d) => d.status === 'online').length
  const offlineDistributors = data.distributors.filter((d) => d.status === 'offline').length
  const maintDistributors  = data.distributors.filter((d) => d.status === 'maintenance').length
  const totalIdle    = data.distributors.reduce((acc, d) => acc + d.idleLockers, 0)
  const totalLockers = data.distributors.reduce((acc, d) => acc + d.lockerCount, 0)
  const fillRate = totalLockers > 0
    ? Math.round(100 * (totalLockers - totalIdle) / totalLockers)
    : 0

  const criticalTickets = openTickets.filter((t) => t.severity >= 4)

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">Vue d&apos;ensemble</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {useDemo && ' · données fictives — branchez un token admin valide pour voir le vivant'}
          </p>
        </div>
        <RefreshButton />
      </header>

      {/* Tendance — sparkline réservations 7 jours */}
      <section className="rounded-xl border border-white/10 bg-navy-800 p-4 sm:p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Tendance · réservations
          </h3>
          <span className="text-[11px] text-white/40">7 derniers jours</span>
        </div>
        <Sparkline points={dailySeries} width={520} />
      </section>

      {/* Bloc 1 — Parc */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Parc</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Distributeurs"
            value={totalDistributors}
            hint={
              <span>
                <span className="text-emerald-300">{onlineDistributors} online</span>
                {' · '}
                <span className="text-rose-300">{offlineDistributors} offline</span>
                {maintDistributors > 0 && (
                  <>{' · '}<span className="text-amber-300">{maintDistributors} maintenance</span></>
                )}
              </span>
            }
            tone={offlineDistributors > 0 ? 'warn' : 'neutral'}
            href="/distributors"
          />
          <StatCard
            label="Casiers libres"
            value={`${totalIdle} / ${totalLockers}`}
            hint={`Taux d'occupation ${fillRate}%`}
            tone={fillRate > 80 ? 'warn' : 'neutral'}
          />
          <StatCard
            label="Réservations actives"
            value={activeReservations.length}
            hint={activeReservations.length > 0 ? 'Emprunts en cours' : 'Aucun emprunt en cours'}
            tone="good"
            href="/reservations?status=active"
          />
          <StatCard
            label="En retard"
            value={overdueReservations.length}
            hint={overdueReservations.length > 0 ? 'Item non rendu après deadline' : 'Tout est rentré dans les temps'}
            tone={overdueReservations.length > 0 ? 'bad' : 'good'}
            href="/reservations?status=overdue"
          />
        </div>
      </section>

      {/* Bloc 2 — Maintenance */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Maintenance</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Tickets ouverts"
            value={openTickets.length}
            hint={`${criticalTickets.length} critique${criticalTickets.length > 1 ? 's' : ''} (sév. ≥ 4)`}
            tone={criticalTickets.length > 0 ? 'bad' : openTickets.length > 0 ? 'warn' : 'good'}
            href="/maintenance"
          />
          <StatCard
            label="Sévérité moyenne"
            value={openTickets.length > 0
              ? (openTickets.reduce((a, t) => a + t.severity, 0) / openTickets.length).toFixed(1)
              : '—'
            }
            hint="Tickets ouverts uniquement, échelle 1–5"
            tone="neutral"
          />
          <StatCard
            label="Sites impactés"
            value={new Set(openTickets.map((t) => t.distributor.id)).size}
            hint="Distributeurs avec ≥ 1 ticket ouvert"
            tone="neutral"
          />
          <StatCard
            label="Non assignés"
            value={openTickets.filter((t) => !t.assignee).length}
            hint="Tickets ouverts sans technicien"
            tone={openTickets.filter((t) => !t.assignee).length > 0 ? 'warn' : 'good'}
          />
        </div>
      </section>

      {/* Alertes — overdue & critical tickets */}
      {(overdueReservations.length > 0 || criticalTickets.length > 0) && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">Alertes à traiter</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Overdue reservations */}
            {overdueReservations.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-rose-500/20 bg-navy-800">
                <header className="flex items-baseline justify-between border-b border-white/5 px-4 py-3">
                  <h4 className="text-sm font-medium text-white">Réservations en retard</h4>
                  <Link href="/reservations?status=overdue" className="text-xs text-rose-300 hover:text-rose-200">
                    voir tout →
                  </Link>
                </header>
                <ul className="divide-y divide-white/5">
                  {overdueReservations.slice(0, 5).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white">
                          {r.user.displayName ?? r.user.email}
                        </div>
                        <div className="truncate text-[11px] text-white/50">
                          {r.item.typeName} · {r.distributor.name}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] text-rose-300/90 tabular-nums">
                        {r.dueAt ? `dû ${fmtRelative(r.dueAt)}` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Critical tickets */}
            {criticalTickets.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-orange-500/20 bg-navy-800">
                <header className="flex items-baseline justify-between border-b border-white/5 px-4 py-3">
                  <h4 className="text-sm font-medium text-white">Tickets critiques ouverts</h4>
                  <Link href="/maintenance" className="text-xs text-orange-300 hover:text-orange-200">
                    voir kanban →
                  </Link>
                </header>
                <ul className="divide-y divide-white/5">
                  {criticalTickets.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white">{t.title}</div>
                        <div className="truncate text-[11px] text-white/50">{t.distributor.name}</div>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                        SEVERITY_STYLE[t.severity] ?? SEVERITY_STYLE[3],
                      )}>
                        S{t.severity}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
