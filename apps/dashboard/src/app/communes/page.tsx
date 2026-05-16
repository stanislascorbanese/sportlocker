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
  active:         { label: 'actif',          cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  expiring_soon:  { label: '< 60 j',         cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  expired:        { label: 'expiré',         cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  none:           { label: 'sans contrat',   cls: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30' },
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
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl">Communes</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {communes.length} commune{communes.length > 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-300">{activeContracts} contrat{activeContracts > 1 ? 's' : ''} actif{activeContracts > 1 ? 's' : ''}</span>
            {' · '}
            {totalDistributors} distributeur{totalDistributors > 1 ? 's' : ''} déployé{totalDistributors > 1 ? 's' : ''}
            {' · '}
            <span className="text-white/70">{fmtEuros(totalMonthlyRevenue)} / mois récurrent</span>
            {useDemo && ' · données fictives'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link
            href="/communes/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
          >
            + Nouvelle commune
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-800">
        <table className="w-full text-sm">
          <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
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
          <tbody className="divide-y divide-white/5">
            {communes.map((c) => {
              const cs = contractStatus(c)
              const style = CONTRACT_STYLE[cs]
              return (
                <tr key={c.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{c.name}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">CP {c.postalCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-white/70 tabular-nums">{c.inseeCode}</td>
                  <td className="px-4 py-3">
                    <div className="text-white/80">{c.region}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">Département {c.department}</div>
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
                      <div className="mt-0.5 text-[11px] text-white/40">
                        {fmtDate(c.contractStart)} → {fmtDate(c.contractEnd)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-white/80">
                    {fmtEuros(c.monthlyFeeCents)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'tabular-nums',
                      c.distributorCount === 0 ? 'text-white/30' : 'text-white',
                    )}>
                      {c.distributorCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-white/60">
                    {c.contactEmail ? (
                      <a href={`mailto:${c.contactEmail}`} className="hover:text-white">{c.contactEmail}</a>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                    {c.contactPhone && (
                      <div className="mt-0.5 text-[11px] text-white/40">{c.contactPhone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {useDemo ? (
                      <span className="text-xs text-white/30">démo</span>
                    ) : (
                      <Link
                        href={`/communes/${c.id}/edit`}
                        className="text-xs text-emerald-300 transition hover:text-emerald-200"
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
