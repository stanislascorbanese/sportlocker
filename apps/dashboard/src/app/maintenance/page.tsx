import { fetchMaintenanceTickets, type MaintenanceTicket } from '../../lib/api'
import { DEMO_MAINTENANCE_TICKETS } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { TicketCard } from './TicketCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Maintenance · SportLocker ops' }

type ColumnKey = 'open' | 'in_progress' | 'done'

const COLUMNS: Array<{ key: ColumnKey; label: string; description: string; accent: string }> = [
  {
    key: 'open',
    label: 'Ouverts',
    description: 'À prendre en charge',
    accent: 'border-rose-300 dark:border-rose-500/30',
  },
  {
    key: 'in_progress',
    label: 'En cours',
    description: 'Assigné, en travail',
    accent: 'border-amber-300 dark:border-amber-500/30',
  },
  {
    key: 'done',
    label: 'Terminés',
    description: 'Résolus / abandonnés',
    accent: 'border-emerald-300 dark:border-emerald-500/30',
  },
]

function bucket(t: MaintenanceTicket): ColumnKey {
  if (t.status === 'open') return 'open'
  if (t.status === 'in_progress') return 'in_progress'
  return 'done'
}

export default async function MaintenancePage() {
  let realTickets: MaintenanceTicket[] = []
  let fetchError: string | null = null

  try {
    realTickets = await fetchMaintenanceTickets()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = fetchError !== null || realTickets.length === 0
  const tickets = useDemo ? DEMO_MAINTENANCE_TICKETS : realTickets

  const grouped: Record<ColumnKey, MaintenanceTicket[]> = {
    open: [],
    in_progress: [],
    done: [],
  }
  for (const t of tickets) grouped[bucket(t)].push(t)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
              Tickets de maintenance
            </h2>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {tickets.length} ticket{tickets.length > 1 ? 's' : ''} ·{' '}
            <span className="text-rose-700 dark:text-rose-300">{grouped.open.length} ouvert{grouped.open.length > 1 ? 's' : ''}</span>
            {' · '}
            <span className="text-amber-700 dark:text-amber-300">{grouped.in_progress.length} en cours</span>
            {useDemo && ' · données fictives'}
          </p>
        </div>
        <RefreshButton />
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => (
          <section
            key={col.key}
            className={`rounded-card border-t-2 ${col.accent} bg-white p-3 shadow-card dark:bg-navy-800/40 dark:shadow-none`}
          >
            <header className="mb-3 flex items-baseline justify-between">
              <h3 className="font-medium text-navy-900 dark:text-white">{col.label}</h3>
              <span className="text-xs text-gray-500 dark:text-white/40">{grouped[col.key].length}</span>
            </header>
            <p className="mb-3 text-meta text-gray-500 dark:text-white/40">{col.description}</p>

            <div className="space-y-2">
              {grouped[col.key].length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400 dark:border-white/10 dark:text-white/30">
                  aucun ticket
                </div>
              ) : (
                grouped[col.key].map((t) => <TicketCard key={t.id} ticket={t} demo={useDemo} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
