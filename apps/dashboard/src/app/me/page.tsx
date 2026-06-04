import { redirect } from 'next/navigation'
import { Mail, Phone, MapPin, Calendar, Clock, ShieldCheck, Building2, Server, Package, CalendarClock } from 'lucide-react'

import {
  fetchCommunes,
  fetchDistributors,
  fetchReservationsDaily,
  fetchStatsDashboard,
  fetchUsers,
  type AdminUser,
  type Commune,
  type DailyPoint,
  type Distributor,
} from '../../lib/api'
import { DEMO_COMMUNES, demoReservationsDaily, demoStatsDashboard } from '../../lib/demo-data'
import { getSessionUser } from '../../lib/session-server'
import { StatCard } from '../../components/StatCard'
import { cn } from '../../lib/cn'
import type { SessionPayload } from '../../lib/session'
import { getLang } from '../../lib/lang-server'
import type { Lang } from '../../lib/lang'
import { dateLocale, fmtRelative, commonStrings } from '../../lib/i18n/common'
import { meStrings, roleLabel } from '../../lib/i18n/me'

import { ResetPasswordButton } from './ResetPasswordButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mon compte · SportLocker ops' }

type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'none'

function contractStatus(c: Commune): ContractStatus {
  if (!c.contractEnd) return 'none'
  const endMs = new Date(c.contractEnd).getTime()
  const now = Date.now()
  if (endMs < now) return 'expired'
  if (endMs - now < 60 * 24 * 3600 * 1000) return 'expiring_soon'
  return 'active'
}

const CONTRACT_CLS: Record<ContractStatus, string> = {
  active:        'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  expiring_soon: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  expired:       'bg-rose-500/10 text-rose-300 border-rose-500/30',
  none:          'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
}

const ROLE_CLS: Record<SessionPayload['role'], string> = {
  super_admin: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
  admin:       'bg-sky-500/10 text-sky-200 border-sky-500/30',
  operator:    'bg-zinc-500/10 text-zinc-200 border-zinc-500/30',
}

function fmtEuros(lang: Lang, cents: number): string {
  if (cents === 0) return '—'
  return `${(cents / 100).toLocaleString(dateLocale(lang), { maximumFractionDigits: 0 })} €`
}

function fmtDate(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'long', year: 'numeric' })
}

function fmtDateTime(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(dateLocale(lang), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 1).toUpperCase()
}

type AdminTenantData = {
  commune: Commune
  distributors: Distributor[]
  totalReservations30d: number
  useDemo: boolean
}

async function loadAdminTenantData(): Promise<AdminTenantData> {
  let communes: Commune[] = []
  let distributors: Distributor[] = []
  let daily: DailyPoint[] = []
  let hadError = false

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { hadError = true; return fallback }
  }

  ;[communes, distributors, daily] = await Promise.all([
    safe(fetchCommunes(), []),
    safe(fetchDistributors(), []),
    safe(fetchReservationsDaily(30), []),
  ])

  const useDemo = hadError || communes.length === 0
  const commune = useDemo ? DEMO_COMMUNES[0]! : communes[0]!
  const dailySeries = useDemo || daily.length === 0 ? demoReservationsDaily(30) : daily
  const totalReservations30d = dailySeries.reduce((acc, p) => acc + p.count, 0)

  return {
    commune,
    distributors: useDemo ? [] : distributors,
    totalReservations30d,
    useDemo,
  }
}

type SuperAdminData = {
  communesCount: number
  distributorsCount: number
  lastCommune: Commune | null
  reservations7d: number
  useDemo: boolean
}

async function loadSuperAdminData(): Promise<SuperAdminData> {
  let communes: Commune[] = []
  let distributors: Distributor[] = []
  let stats7d = 0
  let hadError = false

  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try { return await p } catch { hadError = true; return fallback }
  }

  const [c, d, statsResult] = await Promise.all([
    safe(fetchCommunes(), [] as Commune[]),
    safe(fetchDistributors(), [] as Distributor[]),
    safe(fetchStatsDashboard(7).then((s) => s.daily.reduce((a, p) => a + p.count, 0)), 0),
  ])
  communes = c
  distributors = d
  stats7d = statsResult

  const useDemo = hadError || (communes.length === 0 && distributors.length === 0)
  if (useDemo) {
    const demoStats = demoStatsDashboard(7)
    return {
      communesCount: DEMO_COMMUNES.length,
      distributorsCount: DEMO_COMMUNES.reduce((a, c) => a + c.distributorCount, 0),
      lastCommune: DEMO_COMMUNES[0]!,
      reservations7d: demoStats.daily.reduce((a, p) => a + p.count, 0),
      useDemo: true,
    }
  }

  return {
    communesCount: communes.length,
    distributorsCount: distributors.length,
    lastCommune: communes[0] ?? null,
    reservations7d: stats7d,
    useDemo: false,
  }
}

async function loadSelfProfile(email: string): Promise<AdminUser | null> {
  try {
    const users = await fetchUsers({ q: email })
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
  } catch {
    return null
  }
}

export default async function MePage() {
  const user = await getSessionUser()
  if (!user) redirect('/login?redirect=/me')

  const lang = await getLang()
  const t = meStrings(lang)

  const profile = await loadSelfProfile(user.email)
  const displayName = profile?.displayName ?? null

  return (
    <div className="space-y-8">
      {/* ─── Header ─── */}
      <header className="flex items-start gap-4 sm:gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-xl font-semibold text-emerald-200 ring-1 ring-emerald-500/30 sm:h-20 sm:w-20 sm:text-2xl">
          {initials(displayName, user.email)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words font-display text-2xl tracking-tight sm:text-3xl">
            {displayName ?? user.email}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-white/55">
            <Mail className="h-3.5 w-3.5" />
            <span className="truncate">{user.email}</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide',
              ROLE_CLS[user.role],
            )}>
              <ShieldCheck className="h-3 w-3" />
              {roleLabel(lang, user.role)}
            </span>
            {user.role === 'admin' && user.communeId && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/60">
                <Building2 className="h-3 w-3" />
                {t.communeAssigned}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ─── Profil ─── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t.sectionProfile}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow icon={<Mail className="h-4 w-4" />} label={t.rowEmail}>
            <span className="font-mono text-[13px]">{user.email}</span>
          </InfoRow>
          <InfoRow icon={<Clock className="h-4 w-4" />} label={t.rowLastActivity}>
            {profile?.lastActiveAt ? (
              <span title={fmtDateTime(lang, profile.lastActiveAt)}>
                {fmtRelative(lang, profile.lastActiveAt) ?? fmtDateTime(lang, profile.lastActiveAt)}
              </span>
            ) : (
              <span className="text-white/40">{t.notAvailable}</span>
            )}
          </InfoRow>
          <InfoRow icon={<Calendar className="h-4 w-4" />} label={t.rowAccountCreated}>
            {profile?.createdAt ? fmtDate(lang, profile.createdAt) : <span className="text-white/40">{t.notAvailable}</span>}
          </InfoRow>
          {profile?.phone && (
            <InfoRow icon={<Phone className="h-4 w-4" />} label={t.rowPhone}>
              {profile.phone}
            </InfoRow>
          )}
        </div>
      </section>

      {/* ─── Section conditionnelle selon rôle ─── */}
      {user.role === 'admin' && <AdminTenantSection lang={lang} />}
      {user.role === 'super_admin' && <SuperAdminSection lang={lang} />}

      {/* ─── Sécurité ─── */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t.sectionSecurity}</h2>
        <div className="rounded-xl border border-white/10 bg-navy-800 p-5">
          <p className="text-sm text-white/70">{t.securityHelp}</p>
          <div className="mt-4">
            <ResetPasswordButton email={user.email} lang={lang} />
          </div>
        </div>
      </section>
    </div>
  )
}

function InfoRow({
  icon, label, children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/40">
        <span className="text-white/30">{icon}</span>
        {label}
      </p>
      <div className="mt-2 text-sm text-white/90">{children}</div>
    </div>
  )
}

async function AdminTenantSection({ lang }: { lang: Lang }) {
  const t = meStrings(lang)
  const c = commonStrings(lang)
  const contractLabels: Record<ContractStatus, string> = {
    active:        t.contractActive,
    expiring_soon: t.contractExpiringSoon,
    expired:       t.contractExpired,
    none:          t.contractNone,
  }

  const { commune, distributors, totalReservations30d, useDemo } = await loadAdminTenantData()
  const cs = contractStatus(commune)

  const totalLockers = distributors.reduce((a, d) => a + d.lockerCount, 0)
  const idleLockers  = distributors.reduce((a, d) => a + d.idleLockers, 0)
  const fillRate = totalLockers > 0 ? Math.round(100 * (totalLockers - idleLockers) / totalLockers) : 0
  const deployedCount = useDemo ? commune.distributorCount : distributors.length

  return (
    <>
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t.sectionMyCommune}</h2>
          {useDemo && (
            <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              {c.demo}
            </span>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-800">
          <div className="flex flex-col gap-4 border-b border-white/5 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h3 className="font-display text-xl text-white">{commune.name}</h3>
                <span className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  CONTRACT_CLS[cs],
                )}>
                  {t.contractPrefix} {contractLabels[cs]}
                </span>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-white/50">
                <MapPin className="h-3 w-3" />
                {commune.region} · {t.department} {commune.department} · {t.cp} {commune.postalCode}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-[10px] uppercase tracking-wider text-white/40">{t.monthlyFee}</p>
              <p className="mt-0.5 font-display text-2xl text-emerald-300 tabular-nums">
                {fmtEuros(lang, commune.monthlyFeeCents)}
              </p>
            </div>
          </div>

          <dl className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            <Field label={t.inseeCode} value={<span className="font-mono">{commune.inseeCode}</span>} />
            <Field
              label={t.population}
              value={commune.population != null
                ? commune.population.toLocaleString(dateLocale(lang)) + ` ${t.populationSuffix}`
                : <span className="text-white/40">—</span>}
            />
            <Field label={t.contractStart} value={fmtDate(lang, commune.contractStart)} />
            <Field label={t.contractEnd}   value={fmtDate(lang, commune.contractEnd)} />
            <Field
              label={t.contactEmail}
              value={commune.contactEmail
                ? <a href={`mailto:${commune.contactEmail}`} className="text-emerald-300 hover:text-emerald-200">{commune.contactEmail}</a>
                : <span className="text-white/40">—</span>}
            />
            <Field
              label={t.contactPhone}
              value={commune.contactPhone ?? <span className="text-white/40">—</span>}
            />
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t.sectionMyStats}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t.kpiDeployedDist}
            value={deployedCount}
            hint={useDemo
              ? t.kpiDeployedDistHintDemo
              : t.kpiDeployedDistHintOnline.replace('%d', String(distributors.filter((d) => d.status === 'online').length))}
            tone="neutral"
            href="/distributors"
            icon={<Server className="h-4 w-4" />}
          />
          <StatCard
            label={t.kpiTotalLockers}
            value={useDemo ? '—' : totalLockers}
            hint={useDemo ? t.kpiTotalLockersHintDemo : t.kpiTotalLockersHintFree.replace('%d', String(idleLockers))}
            tone="neutral"
            icon={<Package className="h-4 w-4" />}
          />
          <StatCard
            label={t.kpiRes30d}
            value={totalReservations30d}
            hint={useDemo ? t.kpiRes30dHintDemo : t.kpiRes30dHintReal}
            tone="good"
            href="/reservations"
            icon={<CalendarClock className="h-4 w-4" />}
          />
          <StatCard
            label={t.kpiFillRate}
            value={useDemo ? '—' : `${fillRate}%`}
            hint={useDemo ? '' : t.kpiFillRateHint}
            tone={fillRate > 80 ? 'warn' : 'neutral'}
          />
        </div>
      </section>
    </>
  )
}

async function SuperAdminSection({ lang }: { lang: Lang }) {
  const t = meStrings(lang)
  const c = commonStrings(lang)
  const data = await loadSuperAdminData()

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-white/40">{t.sectionSystem}</h2>
        {data.useDemo && (
          <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            {c.demo}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t.kpiCommunesManaged}
          value={data.communesCount}
          hint={data.useDemo ? t.kpiCommunesManagedHintDemo : t.kpiCommunesManagedHint}
          tone="good"
          href="/super-admin/tenants"
          icon={<Building2 className="h-4 w-4" />}
        />
        <StatCard
          label={t.kpiDistributors}
          value={data.distributorsCount}
          hint={t.kpiDistributorsHint}
          tone="neutral"
          href="/distributors"
          icon={<Server className="h-4 w-4" />}
        />
        <StatCard
          label={t.kpiRes7d}
          value={data.reservations7d}
          hint={t.kpiRes7dHint}
          tone="good"
          href="/reservations"
          icon={<CalendarClock className="h-4 w-4" />}
        />
        {data.lastCommune ? (
          <StatCard
            label={t.kpiFeaturedCommune}
            value={data.lastCommune.name}
            hint={`${data.lastCommune.distributorCount} ${data.lastCommune.distributorCount > 1 ? t.distributorPlural : t.distributorSingular}`}
            tone="neutral"
            href={`/communes/${data.lastCommune.id}/edit`}
          />
        ) : (
          <StatCard
            label={t.kpiFeaturedCommune}
            value="—"
            hint={t.kpiNoCommune}
            tone="neutral"
          />
        )}
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className="mt-1 text-sm text-white/85">{value}</dd>
    </div>
  )
}
