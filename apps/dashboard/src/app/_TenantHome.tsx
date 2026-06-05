import Link from 'next/link'

import {
  fetchCommunes,
  fetchDistributors,
  fetchMaintenanceTickets,
  fetchReservations,
  fetchReservationsDaily,
  fetchStatsDashboard,
  type Commune,
  type DailyPoint,
  type Distributor,
  type MaintenanceTicket,
  type Reservation,
  type StatsDashboard,
} from '../lib/api'
import {
  DEMO_COMMUNES,
  DEMO_RESERVATIONS,
  DEMO_MAINTENANCE_TICKETS,
  demoReservationsDaily,
  demoStatsDashboard,
} from '../lib/demo-data'
import { DistributorCard } from '../components/DistributorCard'
import { RefreshButton } from '../components/RefreshButton'
import { Sparkline } from '../components/Sparkline'
import { cn } from '../lib/cn'
import { getLang } from '../lib/lang-server'
import { commonStrings, fmtRelative, fmtToday } from '../lib/i18n/common'
import { homeStrings } from '../lib/i18n/home'

type TenantSnapshot = {
  commune: Commune | null
  distributors: Distributor[]
  activeReservations: Reservation[]
  overdueReservations: Reservation[]
  openTickets: MaintenanceTicket[]
  dailySeries: DailyPoint[]
  topDistributors: StatsDashboard['topDistributors']
  hadError: boolean
}

async function loadTenant(communeId: string): Promise<TenantSnapshot> {
  let commune: Commune | null = null
  let distributors: Distributor[] = []
  let activeReservations: Reservation[] = []
  let overdueReservations: Reservation[] = []
  let openTickets: MaintenanceTicket[] = []
  let dailySeries: DailyPoint[] = []
  let topDistributors: StatsDashboard['topDistributors'] = []
  let hadError = false

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { hadError = true; return fallback }
  }

  ;[
    commune,
    distributors,
    activeReservations,
    overdueReservations,
    openTickets,
    dailySeries,
    topDistributors,
  ] = await Promise.all([
    safe(fetchCommunes().then((items) => items.find((c) => c.id === communeId) ?? items[0] ?? null), null),
    safe(fetchDistributors(), []),
    safe(fetchReservations({ status: 'active', limit: 100 }).then((p) => p.items), []),
    safe(fetchReservations({ status: 'overdue', limit: 50 }).then((p) => p.items), []),
    safe(fetchMaintenanceTickets({ status: 'open' }), []),
    safe(fetchReservationsDaily(7), []),
    safe(fetchStatsDashboard(7).then((s) => s.topDistributors), []),
  ])

  return {
    commune,
    distributors,
    activeReservations,
    overdueReservations,
    openTickets,
    dailySeries,
    topDistributors,
    hadError,
  }
}

export async function TenantHome({ communeId }: { communeId: string }) {
  const lang = await getLang()
  const t = homeStrings(lang)
  const c = commonStrings(lang)
  const data = await loadTenant(communeId)

  const everythingEmpty = data.distributors.length === 0
    && data.activeReservations.length === 0
    && data.overdueReservations.length === 0
    && data.openTickets.length === 0
  const useDemo = data.hadError || everythingEmpty

  // En mode démo, on simule le scope tenant : prend la commune Paris 11e
  // (1ère fixture) et filtre les data dessus.
  const demoCommune = DEMO_COMMUNES[0]!
  const commune = useDemo ? demoCommune : (data.commune ?? demoCommune)

  // En vrai mode (non démo), l'API renvoie déjà uniquement les distributeurs
  // de la commune (scope serveur). En démo, on filtre côté client.
  const distributors = useDemo
    ? [] // pas de fixtures distributeurs scopées Paris 11e — on affiche 3 cartes synthétiques
    : data.distributors
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
  const topDistributors = useDemo || data.topDistributors.length === 0
    ? demoStatsDashboard(7).topDistributors.slice(0, 3)
    : data.topDistributors

  // Pour les fixtures démo de distributeurs : on prend les 3 premières du topDistributors démo
  // et on reconstruit des Distributor synthétiques cohérents
  const displayDistributors: Distributor[] = useDemo
    ? topDistributors.map((d, idx): Distributor => ({
        id: d.id,
        serialNumber: d.serialNumber,
        name: d.name,
        status: idx === 2 ? 'maintenance' : 'online',
        communeId: commune.id,
        lockerCount: 8,
        idleLockers: idx === 2 ? 8 : 8 - (idx + 2),
        latitude: null,
        longitude: null,
        addressLine: null,
        batteryPercent: null,
        lastSeenAt: new Date(Date.now() - (idx + 1) * 60_000).toISOString(),
      }))
    : distributors

  // KPIs agrégés sur le périmètre tenant
  const totalLockers = displayDistributors.reduce((acc, d) => acc + d.lockerCount, 0)
  const totalIdle = displayDistributors.reduce((acc, d) => acc + d.idleLockers, 0)
  const fillRate = totalLockers > 0
    ? Math.round(100 * (totalLockers - totalIdle) / totalLockers)
    : 0
  const onlineCount = displayDistributors.filter((d) => d.status === 'online').length
  const offlineCount = displayDistributors.filter((d) => d.status === 'offline').length
  const totalWeek = dailySeries.reduce((a, p) => a + p.count, 0)
  const criticalTickets = openTickets.filter((t) => t.severity >= 4)

  // Index pour aller chercher rapidement "résa 7j par distributeur" et "tickets par distributeur"
  const weeklyByDistributor = new Map<string, number>()
  topDistributors.forEach((d) => weeklyByDistributor.set(d.id, d.count))
  const ticketsByDistributor = new Map<string, number>()
  openTickets.forEach((t) => {
    ticketsByDistributor.set(t.distributor.id, (ticketsByDistributor.get(t.distributor.id) ?? 0) + 1)
  })

  return (
    <div className="space-y-6">
      {/* Header personnalisé tenant — gradient emerald = signature visuelle */}
      <header className="overflow-hidden rounded-card border p-4 sm:p-6 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-white dark:border-emerald-500/20 dark:from-emerald-500/[0.06] dark:via-navy-800 dark:to-navy-800">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-2xl">👋</span>
              <h1 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
                {t.tenantGreeting}{' '}
                <span className="text-emerald-700 dark:text-emerald-300">{commune.name}</span>
              </h1>
              {useDemo && (
                <span className="rounded-md border px-2 py-0.5 text-eyebrow font-semibold uppercase border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  {c.demo}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-gray-700 dark:text-white/65">
              {displayDistributors.length} {displayDistributors.length > 1 ? t.tenantDistributorsInServiceMany : t.tenantDistributorsInService1} ·{' '}
              <span className="tabular-nums text-emerald-700 dark:text-emerald-300">{totalIdle}</span>
              <span className="text-gray-500 dark:text-white/40"> / {totalLockers}</span> {t.tenantLockersFree} ·{' '}
              {t.tenantFillRate}{' '}
              <span className="tabular-nums text-navy-900 dark:text-white">{fillRate}%</span>
            </p>
          </div>
          <RefreshButton />
        </div>
      </header>

      {data.hadError && (
        <div className="rounded-card border p-3 text-sm border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
        </div>
      )}

      {/* Aujourd'hui / Cette semaine */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Aujourd'hui */}
        <div className="rounded-card border p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-navy-800">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
              {t.tenantToday}
            </h2>
            <span className="text-meta text-gray-500 dark:text-white/40">
              {fmtToday(lang)}
            </span>
          </div>
          <div className="space-y-3">
            <KpiRow
              icon="🟢"
              label={t.tenantOngoingReservations}
              value={activeReservations.length}
              tone="good"
            />
            <KpiRow
              icon="🟠"
              label={t.tenantOverdue}
              value={overdueReservations.length}
              tone={overdueReservations.length > 0 ? 'bad' : 'neutral'}
              href="/reservations?status=overdue"
            />
            <KpiRow
              icon="🔧"
              label={t.tenantOpenTickets}
              value={openTickets.length}
              tone={criticalTickets.length > 0 ? 'bad' : openTickets.length > 0 ? 'warn' : 'neutral'}
              {...(criticalTickets.length > 0
                ? {
                    hint: criticalTickets.length === 1
                      ? t.tenantCriticalOfOne
                      : t.tenantCriticalOf.replace('%d', String(criticalTickets.length)),
                  }
                : {})}
              href="/maintenance"
            />
          </div>
        </div>

        {/* Cette semaine */}
        <div className="rounded-card border p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-navy-800">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
              {t.tenantThisWeek}
            </h2>
            <Link
              href="/stats?days=30"
              className="text-meta text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
            >
              {t.tenantViewDetailedStats}
            </Link>
          </div>
          <Sparkline points={dailySeries} width={420} />
        </div>
      </section>

      {/* Distributeurs */}
      <section className="space-y-3">
        <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.tenantYourDistributors}
          {(offlineCount > 0) && (
            <span className="ml-2 normal-case text-rose-700/80 dark:text-rose-300/80">
              · {offlineCount} {t.tenantOfflineSuffix}
            </span>
          )}
        </h2>
        {displayDistributors.length === 0 ? (
          <div className="rounded-card border border-dashed p-8 text-center text-sm border-gray-300 bg-gray-50 text-gray-600 dark:border-white/15 dark:bg-navy-800/50 dark:text-white/55">
            {t.tenantNoDistributors}
            <br />
            <span className="mt-2 inline-block text-meta text-gray-500 dark:text-white/40">
              {t.tenantNoDistributorsHint}
            </span>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {displayDistributors.map((d) => (
              <DistributorCard
                key={d.id}
                distributor={d}
                weeklyReservations={weeklyByDistributor.get(d.id) ?? 0}
                openTickets={ticketsByDistributor.get(d.id) ?? 0}
                lang={lang}
              />
            ))}
          </div>
        )}
      </section>

      {/* Alertes à traiter */}
      {(overdueReservations.length > 0 || criticalTickets.length > 0) && (
        <section className="space-y-3">
          <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
            {t.sectionAlerts}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {overdueReservations.length > 0 && (
              <AlertList
                title={t.overdueReservations}
                viewAllLabel={t.seeAll}
                href="/reservations?status=overdue"
                borderClass="border-rose-300 dark:border-rose-500/20"
                accentClass="text-rose-700 dark:text-rose-300"
                items={overdueReservations.slice(0, 4).map((r) => ({
                  key: r.id,
                  primary: r.user.displayName ?? r.user.email,
                  secondary: `${r.item.typeName} · ${r.distributor.name}`,
                  right: r.dueAt ? `${t.duePrefix} ${fmtRelative(lang, r.dueAt)}` : '—',
                }))}
              />
            )}
            {criticalTickets.length > 0 && (
              <AlertList
                title={t.tenantCriticalTickets}
                viewAllLabel={t.seeAll}
                href="/maintenance"
                borderClass="border-orange-300 dark:border-orange-500/20"
                accentClass="text-orange-700 dark:text-orange-300"
                items={criticalTickets.slice(0, 4).map((tk) => ({
                  key: tk.id,
                  primary: tk.title,
                  secondary: tk.distributor.name,
                  right: `S${tk.severity}`,
                }))}
              />
            )}
          </div>
        </section>
      )}

      {/* Footer onboarding-friendly */}
      <footer className="rounded-card border p-4 text-center text-meta border-gray-200 bg-gray-50 text-gray-600 dark:border-white/5 dark:bg-white/[0.02] dark:text-white/50">
        {t.tenantFooterPart1}{' '}
        <Link
          href="/maintenance"
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          {t.tenantFooterOpenTicket}
        </Link>
        {' '}{t.tenantFooterOrContact}{' '}
        <a
          href="mailto:support@sportlocker.fr"
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          support@sportlocker.fr
        </a>.
      </footer>
    </div>
  )
}

function KpiRow({
  icon,
  label,
  value,
  tone,
  hint,
  href,
}: {
  icon: string
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad' | 'neutral'
  hint?: string
  href?: string
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-700 dark:text-emerald-300'
    : tone === 'warn' ? 'text-amber-700 dark:text-amber-300'
    : tone === 'bad' ? 'text-rose-700 dark:text-rose-300'
    : 'text-navy-900 dark:text-white/80'

  const content = (
    <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors duration-base hover:bg-white dark:hover:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm text-navy-900 dark:text-white/85">{label}</p>
          {hint && <p className="text-meta text-gray-500 dark:text-white/45">{hint}</p>}
        </div>
      </div>
      <span className={cn('font-display text-2xl tabular-nums', valueColor)}>{value}</span>
    </div>
  )

  if (href) return <Link href={href}>{content}</Link>
  return content
}

function AlertList({
  title,
  viewAllLabel,
  href,
  borderClass,
  accentClass,
  items,
}: {
  title: string
  viewAllLabel: string
  href: string
  borderClass: string
  accentClass: string
  items: { key: string; primary: string; secondary: string; right: string }[]
}) {
  return (
    <div className={cn('overflow-hidden rounded-card border bg-gray-50 dark:bg-navy-800', borderClass)}>
      <header className="flex items-baseline justify-between border-b px-4 py-2.5 border-gray-200 dark:border-white/5">
        <h3 className="text-sm font-medium text-navy-900 dark:text-white">{title}</h3>
        <Link href={href} className={cn('text-meta hover:underline', accentClass)}>
          {viewAllLabel}
        </Link>
      </header>
      <ul className="divide-y divide-gray-200 dark:divide-white/5">
        {items.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <div className="truncate text-navy-900 dark:text-white">{it.primary}</div>
              <div className="truncate text-meta text-gray-500 dark:text-white/50">
                {it.secondary}
              </div>
            </div>
            <span className={cn('shrink-0 tabular-nums text-meta', accentClass)}>{it.right}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
