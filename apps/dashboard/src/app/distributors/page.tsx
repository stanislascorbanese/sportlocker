import Link from 'next/link'

import { fetchDistributors } from '../../lib/api'
import { StatusPill } from '../../components/StatusPill'
import { BatteryGauge } from '../../components/BatteryGauge'
import { RefreshButton } from '../../components/RefreshButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Distributeurs · SportLocker ops' }

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return new Date(iso).toLocaleDateString('fr-FR')
}

function fmtCoord(coord: number | null): string {
  return coord == null ? '—' : coord.toFixed(4)
}

export default async function DistributorsListPage() {
  let distributors: Awaited<ReturnType<typeof fetchDistributors>> = []
  let fetchError: string | null = null

  try {
    distributors = await fetchDistributors()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const online = distributors.filter((d) => d.status === 'online').length
  const totalIdle = distributors.reduce((acc, d) => acc + d.idleLockers, 0)
  const totalLockers = distributors.reduce((acc, d) => acc + d.lockerCount, 0)

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl">Parc de distributeurs</h2>
          <p className="mt-1 text-sm text-white/55">
            {distributors.length} distributeur{distributors.length > 1 ? 's' : ''} ·{' '}
            <span className="text-emerald-300">{online} online</span> ·{' '}
            {totalIdle} / {totalLockers} casiers libres
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RefreshButton />
          <Link
            href="/distributors/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
          >
            + Nouveau
          </Link>
        </div>
      </header>

      {fetchError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-semibold">API injoignable</p>
          <p className="mt-1 font-mono text-xs text-rose-300/80">{fetchError}</p>
        </div>
      )}

      {!fetchError && distributors.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-navy-800 p-8 text-center text-sm text-white/55">
          Aucun distributeur en base. Créez-en un via{' '}
          <code className="rounded bg-navy-700 px-1.5 py-0.5 font-mono text-xs text-white/80">
            POST /v1/distributors
          </code>
        </div>
      )}

      {distributors.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-navy-800">
          <table className="w-full text-sm">
            <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">Distributeur</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Casiers libres</th>
                <th className="px-4 py-3 font-medium">Batterie</th>
                <th className="px-4 py-3 font-medium">Position</th>
                <th className="px-4 py-3 font-medium">Dernier signe</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {distributors.map((d) => (
                <tr key={d.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{d.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-white/40">{d.serialNumber}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-baseline gap-1">
                      <span className={
                        d.idleLockers === 0 ? 'text-rose-300 font-semibold' :
                        d.idleLockers === 1 ? 'text-amber-300 font-semibold' :
                        'text-emerald-300 font-semibold'
                      }>
                        {d.idleLockers}
                      </span>
                      <span className="text-white/40">/ {d.lockerCount}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <BatteryGauge percent={d.batteryPercent} />
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-white/70">
                    {fmtCoord(d.latitude)}, {fmtCoord(d.longitude)}
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {fmtRelative(d.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/distributors/${d.id}/edit`}
                      className="text-xs text-emerald-300 transition hover:text-emerald-200"
                    >
                      Modifier
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
