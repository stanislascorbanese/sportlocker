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
import { getLang } from '../lib/lang-server'
import { commonStrings, fmtRelative, fmtToday } from '../lib/i18n/common'
import { homeStrings } from '../lib/i18n/home'
import { makeMetadata } from '../lib/i18n/metadata'
import { TenantHome } from './_TenantHome'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => homeStrings(lang).metaTitle)

const SEVERITY_STYLE: Record<number, string> = {
  1: 'bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-500/10 dark:text-zinc-300 dark:border-zinc-500/30',
  2: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  3: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  4: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30',
  5: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
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

  const lang = await getLang()
  const t = homeStrings(lang)
  const c = commonStrings(lang)
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
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
              {t.pageTitleOverview}
            </h2>
            {useDemo && (
              <span className="rounded-md border px-2 py-0.5 text-eyebrow font-semibold uppercase border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {fmtToday(lang)}
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <RefreshButton />
      </header>

      {/* Tendance — sparkline réservations 7 jours */}
      <section className="rounded-card border p-4 sm:p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-navy-800">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
            {t.trendLabel}
          </h3>
          <span className="text-meta text-gray-500 dark:text-white/40">{t.trendLast7Days}</span>
        </div>
        <Sparkline points={dailySeries} width={520} lang={lang} />
      </section>

      {/* Bloc 1 — Parc */}
      <section className="space-y-3">
        <h3 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.sectionPark}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.kpiDistributors}
            value={totalDistributors}
            hint={
              <span>
                <span className="text-emerald-700 dark:text-emerald-300">{onlineDistributors} {t.kpiOnline}</span>
                {' · '}
                <span className="text-rose-700 dark:text-rose-300">{offlineDistributors} {t.kpiOffline}</span>
                {maintDistributors > 0 && (
                  <>{' · '}<span className="text-amber-700 dark:text-amber-300">{maintDistributors} {t.kpiMaintenanceLabel}</span></>
                )}
              </span>
            }
            tone={offlineDistributors > 0 ? 'warn' : 'neutral'}
            href="/distributors"
          />
          <StatCard
            label={t.kpiLockersFree}
            value={`${totalIdle} / ${totalLockers}`}
            hint={`${t.kpiFillRate} ${fillRate}%`}
            tone={fillRate > 80 ? 'warn' : 'neutral'}
          />
          <StatCard
            label={t.kpiActiveReservations}
            value={activeReservations.length}
            hint={activeReservations.length > 0 ? t.kpiActiveHintActive : t.kpiActiveHintNone}
            tone="good"
            href="/reservations?status=active"
          />
          <StatCard
            label={t.kpiOverdueShort}
            value={overdueReservations.length}
            hint={overdueReservations.length > 0 ? t.kpiOverdueHint : t.kpiOverdueAllGood}
            tone={overdueReservations.length > 0 ? 'bad' : 'good'}
            href="/reservations?status=overdue"
          />
        </div>
      </section>

      {/* Bloc 2 — Maintenance */}
      <section className="space-y-3">
        <h3 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.sectionMaintenance}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.kpiOpenTickets}
            value={openTickets.length}
            hint={`${criticalTickets.length} ${criticalTickets.length > 1 ? t.kpiOpenTicketsHint : t.kpiOpenTicketsHint1}`}
            tone={criticalTickets.length > 0 ? 'bad' : openTickets.length > 0 ? 'warn' : 'good'}
            href="/maintenance"
          />
          <StatCard
            label={t.kpiAvgSeverity}
            value={openTickets.length > 0
              ? (openTickets.reduce((a, t) => a + t.severity, 0) / openTickets.length).toFixed(1)
              : '—'
            }
            hint={t.kpiAvgSeverityHint}
            tone="neutral"
          />
          <StatCard
            label={t.kpiImpactedSites}
            value={new Set(openTickets.map((t) => t.distributor.id)).size}
            hint={t.kpiImpactedSitesHint}
            tone="neutral"
          />
          <StatCard
            label={t.kpiUnassigned}
            value={openTickets.filter((t) => !t.assignee).length}
            hint={t.kpiUnassignedHint}
            tone={openTickets.filter((t) => !t.assignee).length > 0 ? 'warn' : 'good'}
          />
        </div>
      </section>

      {/* Alertes — overdue & critical tickets */}
      {(overdueReservations.length > 0 || criticalTickets.length > 0) && (
        <section className="space-y-3">
          <h3 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
            {t.sectionAlerts}
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Overdue reservations */}
            {overdueReservations.length > 0 && (
              <div className="overflow-hidden rounded-card border border-rose-300 bg-gray-50 dark:border-rose-500/20 dark:bg-navy-800">
                <header className="flex items-baseline justify-between border-b px-4 py-3 border-gray-200 dark:border-white/5">
                  <h4 className="text-sm font-medium text-navy-900 dark:text-white">
                    {t.overdueReservations}
                  </h4>
                  <Link
                    href="/reservations?status=overdue"
                    className="text-meta text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200"
                  >
                    {t.seeAll}
                  </Link>
                </header>
                <ul className="divide-y divide-gray-200 dark:divide-white/5">
                  {overdueReservations.slice(0, 5).map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-navy-900 dark:text-white">
                          {r.user.displayName ?? r.user.email}
                        </div>
                        <div className="truncate text-meta text-gray-500 dark:text-white/50">
                          {r.item.typeName} · {r.distributor.name}
                        </div>
                      </div>
                      <span className="shrink-0 tabular-nums text-meta text-rose-700/90 dark:text-rose-300/90">
                        {r.dueAt ? `${t.duePrefix} ${fmtRelative(lang, r.dueAt)}` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Critical tickets */}
            {criticalTickets.length > 0 && (
              <div className="overflow-hidden rounded-card border border-orange-300 bg-gray-50 dark:border-orange-500/20 dark:bg-navy-800">
                <header className="flex items-baseline justify-between border-b px-4 py-3 border-gray-200 dark:border-white/5">
                  <h4 className="text-sm font-medium text-navy-900 dark:text-white">
                    {t.criticalTickets}
                  </h4>
                  <Link
                    href="/maintenance"
                    className="text-meta text-orange-700 hover:text-orange-800 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    {t.seeKanban}
                  </Link>
                </header>
                <ul className="divide-y divide-gray-200 dark:divide-white/5">
                  {criticalTickets.slice(0, 5).map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-navy-900 dark:text-white">{t.title}</div>
                        <div className="truncate text-meta text-gray-500 dark:text-white/50">
                          {t.distributor.name}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                          SEVERITY_STYLE[t.severity] ?? SEVERITY_STYLE[3],
                        )}
                      >
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
