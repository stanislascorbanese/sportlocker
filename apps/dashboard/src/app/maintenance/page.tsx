import { fetchMaintenanceTickets, type MaintenanceTicket } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { TicketCard } from './TicketCard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Maintenance · SportLocker ops' }

type ColumnKey = 'open' | 'in_progress' | 'done'

const COLUMNS: Array<{ key: ColumnKey; label: string; description: string; accent: string }> = [
  { key: 'open',        label: 'Ouverts',     description: 'À prendre en charge', accent: 'border-rose-500/30' },
  { key: 'in_progress', label: 'En cours',    description: 'Assigné, en travail', accent: 'border-amber-500/30' },
  { key: 'done',        label: 'Terminés',    description: 'Résolus / abandonnés', accent: 'border-emerald-500/30' },
]

function bucket(t: MaintenanceTicket): ColumnKey {
  if (t.status === 'open') return 'open'
  if (t.status === 'in_progress') return 'in_progress'
  return 'done'
}

export default async function MaintenancePage() {
  let tickets: MaintenanceTicket[] = []
  let fetchError: string | null = null

  try {
    tickets = await fetchMaintenanceTickets()
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const grouped: Record<ColumnKey, MaintenanceTicket[]> = {
    open: [],
    in_progress: [],
    done: [],
  }
  for (const t of tickets) grouped[bucket(t)].push(t)

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-3xl">Tickets de maintenance</h2>
          <p className="mt-1 text-sm text-white/55">
            {tickets.length} ticket{tickets.length > 1 ? 's' : ''} ·{' '}
            <span className="text-rose-300">{grouped.open.length} ouvert{grouped.open.length > 1 ? 's' : ''}</span>
            {' · '}
            <span className="text-amber-300">{grouped.in_progress.length} en cours</span>
          </p>
        </div>
        <RefreshButton />
      </header>

      {fetchError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-semibold">API injoignable</p>
          <p className="mt-1 font-mono text-xs text-rose-300/80">{fetchError}</p>
        </div>
      )}

      {!fetchError && (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <section
              key={col.key}
              className={`rounded-xl border-t-2 ${col.accent} bg-navy-800/40 p-3`}
            >
              <header className="mb-3 flex items-baseline justify-between">
                <h3 className="font-medium text-white">{col.label}</h3>
                <span className="text-xs text-white/40">{grouped[col.key].length}</span>
              </header>
              <p className="mb-3 text-[11px] text-white/40">{col.description}</p>

              <div className="space-y-2">
                {grouped[col.key].length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/30">
                    aucun ticket
                  </div>
                ) : (
                  grouped[col.key].map((t) => <TicketCard key={t.id} ticket={t} />)
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
