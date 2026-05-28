import Link from 'next/link'

import { fetchCommunes, type Commune } from '../../lib/api'
import { DEMO_COMMUNES } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Communes · SportLocker ops' }

function fmtEuros(cents: number): string {
  if (cents === 0) return '—'
  return `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR')
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

const CONTRACT_STYLE: Record<ContractStatus, { label: string; cls: string }> = {
  active: {
    label: 'actif',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  },
  expiring_soon: {
    label: '< 60 j',
    cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  },
  expired: {
    label: 'expiré',
    cls: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  },
  none: {
    label: 'sans contrat',
    cls: 'bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-500/10 dark:text-zinc-300 dark:border-zinc-500/30',
  },
}

export default async function CommunesPage() {
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
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">Communes</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {communes.length} commune{communes.length > 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-700 dark:text-emerald-300">{activeContracts} contrat{activeContracts > 1 ? 's' : ''} actif{activeContracts > 1 ? 's' : ''}</span>
            {' · '}
            {totalDistributors} distributeur{totalDistributors > 1 ? 's' : ''} déployé{totalDistributors > 1 ? 's' : ''}
            {' · '}
            <span className="text-navy-900 dark:text-white/70">{fmtEuros(totalMonthlyRevenue)} / mois récurrent</span>
            {useDemo && ' · données fictives'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <RefreshButton />
          <Link
            href="/communes/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
          >
            + Nouvelle commune
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-card border bg-white shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
            <tr>
              <th className="px-4 py-3 font-medium">Commune</th>
              <th className="px-4 py-3 font-medium">Code INSEE</th>
              <th className="px-4 py-3 font-medium">Région · Dept.</th>
              <th className="px-4 py-3 font-medium">Contrat</th>
              <th className="px-4 py-3 font-medium text-right">Fee / mois</th>
              <th className="px-4 py-3 font-medium text-right">Distrib.</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/5">
            {communes.map((c) => {
              const cs = contractStatus(c)
              const style = CONTRACT_STYLE[cs]
              return (
                <tr key={c.id} className="transition-colors duration-base hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy-900 dark:text-white">{c.name}</div>
                    <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">CP {c.postalCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] tabular-nums text-gray-700 dark:text-white/70">{c.inseeCode}</td>
                  <td className="px-4 py-3">
                    <div className="text-navy-900 dark:text-white/80">{c.region}</div>
                    <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">Département {c.department}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        style.cls,
                      )}>
                        {style.label}
                      </span>
                    </div>
                    {(c.contractStart || c.contractEnd) && (
                      <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">
                        {fmtDate(c.contractStart)} → {fmtDate(c.contractEnd)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-navy-900 dark:text-white/80">
                    {fmtEuros(c.monthlyFeeCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'tabular-nums',
                      c.distributorCount === 0
                        ? 'text-gray-400 dark:text-white/30'
                        : 'text-navy-900 dark:text-white',
                    )}>
                      {c.distributorCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-gray-600 dark:text-white/60">
                    {c.contactEmail ? (
                      <a
                        href={`mailto:${c.contactEmail}`}
                        className="transition-colors duration-base hover:text-navy-900 dark:hover:text-white"
                      >
                        {c.contactEmail}
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-white/30">—</span>
                    )}
                    {c.contactPhone && (
                      <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">{c.contactPhone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {useDemo ? (
                      <span className="text-xs text-gray-400 dark:text-white/30">démo</span>
                    ) : (
                      <Link
                        href={`/communes/${c.id}/edit`}
                        className="text-xs text-emerald-700 transition-colors duration-base hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
                      >
                        Modifier
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
