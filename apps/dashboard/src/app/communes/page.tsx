import Link from 'next/link'

import { fetchCommunes, type Commune } from '../../lib/api'
import { DEMO_COMMUNES } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import { commonStrings, dateLocale } from '../../lib/i18n/common'
import { communesStrings } from '../../lib/i18n/communes'
import { makeMetadata } from '../../lib/i18n/metadata'
import type { Lang } from '../../lib/lang'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => communesStrings(lang).metaTitle)

function fmtEuros(lang: Lang, cents: number): string {
  if (cents === 0) return '—'
  return `${(cents / 100).toLocaleString(dateLocale(lang), { maximumFractionDigits: 0 })} €`
}

function fmtDate(lang: Lang, iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(dateLocale(lang))
}

type ContractStatus = 'active' | 'expiring_soon' | 'expired' | 'none'

function contractStatus(c: Commune): ContractStatus {
  if (!c.contractEnd) return 'none'
  const endMs = new Date(c.contractEnd).getTime()
  const now = Date.now()
  if (endMs < now) return 'expired'
  if (endMs - now < 60 * 24 * 3600 * 1000) return 'expiring_soon'
  return 'active'
}

const CONTRACT_STYLE: Record<ContractStatus, string> = {
  active:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  expiring_soon:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  expired:
    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  none:
    'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:border-zinc-500/30',
}

export default async function CommunesPage() {
  const lang = await getLang()
  const t = communesStrings(lang)
  const c = commonStrings(lang)
  const contractLabels: Record<ContractStatus, string> = {
    active:        t.contractStatusActive,
    expiring_soon: t.contractStatusExpiringSoon,
    expired:       t.contractStatusExpired,
    none:          t.contractStatusNone,
  }

  let realCommunes: Commune[] = []
  let fetchError: string | null = null

  try {
    realCommunes = await fetchCommunes()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = fetchError !== null || realCommunes.length === 0
  const communes = useDemo ? DEMO_COMMUNES : realCommunes

  const totalDistributors = communes.reduce((a, c) => a + c.distributorCount, 0)
  const totalMonthlyRevenue = communes.reduce((a, c) => a + c.monthlyFeeCents, 0)
  const activeContracts = communes.filter((c) => contractStatus(c) === 'active').length

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
              {t.pageTitle}
            </h2>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {communes.length} {communes.length > 1 ? t.communesMany : t.communes1} ·{' '}
            <span className="text-emerald-700 dark:text-emerald-300">
              {activeContracts} {activeContracts > 1 ? t.contractActiveMany : t.contractActive1}
            </span>
            {' · '}
            {totalDistributors} {totalDistributors > 1 ? t.distributorDeployedMany : t.distributorDeployed1}
            {' · '}
            <span className="text-navy-900 dark:text-white/70">
              {fmtEuros(lang, totalMonthlyRevenue)} {t.monthlyRevenueRecurring}
            </span>
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton />
          <Link
            href="/communes/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
          >
            {t.newCommune}
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {/* Mobile : carte par commune (table 960px min, scroll H pénible) */}
      <div className="space-y-3 md:hidden">
        {communes.map((co) => {
          const cs = contractStatus(co)
          const body = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-navy-900 dark:text-white">{co.name}</div>
                  <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                    INSEE {co.inseeCode} · CP {co.postalCode}
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                  CONTRACT_STYLE[cs],
                )}>
                  {contractLabels[cs]}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-meta">
                <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {t.colFeeMonthly}
                  </div>
                  <div className="mt-0.5 font-display text-sm tabular-nums text-emerald-700 dark:text-emerald-300">
                    {fmtEuros(lang, co.monthlyFeeCents)}
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    {t.colDistributors}
                  </div>
                  <div className="mt-0.5 font-display text-sm tabular-nums">
                    <span className={co.distributorCount === 0 ? 'text-gray-400 dark:text-white/30' : 'text-navy-900 dark:text-white'}>
                      {co.distributorCount}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-gray-200 pt-2 text-meta text-gray-600 dark:border-white/10 dark:text-white/60">
                <div>{co.region} · {t.department} {co.department}</div>
                {co.contactEmail && (
                  <div className="mt-0.5 truncate text-gray-500 dark:text-white/40">{co.contactEmail}</div>
                )}
              </div>
            </>
          )
          return useDemo ? (
            <div key={co.id} className="rounded-card border border-gray-200 bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
              {body}
            </div>
          ) : (
            <Link
              key={co.id}
              href={`/communes/${co.id}/edit`}
              className="block rounded-card border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-navy-800 dark:shadow-none dark:hover:border-white/20"
            >
              {body}
            </Link>
          )
        })}
      </div>

      {/* Desktop : tableau dense */}
      <div className="hidden overflow-x-auto rounded-card border bg-white shadow-card md:block dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
            <tr>
              <th className="px-4 py-3 font-medium">{t.colCommune}</th>
              <th className="px-4 py-3 font-medium">{t.colInsee}</th>
              <th className="px-4 py-3 font-medium">{t.colRegionDept}</th>
              <th className="px-4 py-3 font-medium">{t.colContract}</th>
              <th className="px-4 py-3 font-medium text-right">{t.colFeeMonthly}</th>
              <th className="px-4 py-3 font-medium text-right">{t.colDistributors}</th>
              <th className="px-4 py-3 font-medium">{t.colContact}</th>
              <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/5">
            {communes.map((co) => {
              const cs = contractStatus(co)
              return (
                <tr key={co.id} className="transition-colors duration-base hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-900 dark:text-white">{co.name}</div>
                    <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">CP {co.postalCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-gray-700 dark:text-white/70">{co.inseeCode}</td>
                  <td className="px-4 py-3">
                    <div className="text-navy-900 dark:text-white/80">{co.region}</div>
                    <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">{t.department} {co.department}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        CONTRACT_STYLE[cs],
                      )}>
                        {contractLabels[cs]}
                      </span>
                    </div>
                    {(co.contractStart || co.contractEnd) && (
                      <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">
                        {fmtDate(lang, co.contractStart)} → {fmtDate(lang, co.contractEnd)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-navy-900 dark:text-white/80">
                    {fmtEuros(lang, co.monthlyFeeCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'tabular-nums',
                      co.distributorCount === 0
                        ? 'text-gray-400 dark:text-white/30'
                        : 'text-navy-900 dark:text-white',
                    )}>
                      {co.distributorCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-white/60">
                    {co.contactEmail ? (
                      <a
                        href={`mailto:${co.contactEmail}`}
                        className="transition-colors duration-base hover:text-navy-900 dark:hover:text-white"
                      >
                        {co.contactEmail}
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-white/30">—</span>
                    )}
                    {co.contactPhone && (
                      <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">{co.contactPhone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {useDemo ? (
                      <span className="text-xs text-gray-400 dark:text-white/30">{c.demo}</span>
                    ) : (
                      <Link
                        href={`/communes/${co.id}/edit`}
                        className="text-xs text-emerald-700 transition-colors duration-base hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
                      >
                        {c.modify}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
