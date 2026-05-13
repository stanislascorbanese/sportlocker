import { fetchDistributors } from '../../lib/api'
import { MapClient } from './MapClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Carte du parc · SportLocker' }

export default async function MapPage() {
  let distributors: Awaited<ReturnType<typeof fetchDistributors>> = []
  let fetchError: string | null = null

  try {
    distributors = await fetchDistributors()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl">Carte du parc</h2>
          <p className="mt-1 text-sm text-white/55">
            {distributors.length} distributeur{distributors.length > 1 ? 's' : ''} référencés —
            cliquer un marqueur pour les détails.
          </p>
        </div>
      </header>

      {fetchError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-semibold">API injoignable</p>
          <p className="mt-1 font-mono text-xs text-rose-300/80">{fetchError}</p>
        </div>
      ) : (
        <MapClient distributors={distributors} />
      )}
    </div>
  )
}
