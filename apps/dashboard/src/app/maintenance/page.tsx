import { fetchMaintenanceTickets, type MaintenanceTicket } from '../../lib/api'
import { DEMO_MAINTENANCE_TICKETS } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { maintenanceStrings } from '../../lib/i18n/maintenance'
import { makeMetadata } from '../../lib/i18n/metadata'
import { TicketCard } from './TicketCard'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => maintenanceStrings(lang).metaTitle)

type ColumnKey = 'open' | 'in_progress' | 'done'

function bucket(t: MaintenanceTicket): ColumnKey {
  if (t.status === 'open') return 'open'
  if (t.status === 'in_progress') return 'in_progress'
  return 'done'
}

const COLUMN_ACCENTS: Record<ColumnKey, string> = {
  open:        'border-rose-300 dark:border-rose-500/30',
  in_progress: 'border-amber-300 dark:border-amber-500/30',
  done:        'border-emerald-300 dark:border-emerald-500/30',
}

export default async function MaintenancePage() {
  const lang = await getLang()
  const t = maintenanceStrings(lang)
  const c = commonStrings(lang)

  const columns: Array<{ key: ColumnKey; label: string; description: string; accent: string }> = [
    { key: 'open',        label: t.colOpen,       description: t.colOpenDesc,       accent: COLUMN_ACCENTS.open },
    { key: 'in_progress', label: t.colInProgress, description: t.colInProgressDesc, accent: COLUMN_ACCENTS.in_progress },
    { key: 'done',        label: t.colDone,       description: t.colDoneDesc,       accent: COLUMN_ACCENTS.done },
  ]

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
  for (const tk of tickets) grouped[bucket(tk)].push(tk)

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
            {tickets.length} {tickets.length > 1 ? t.ticketMany : t.ticket1} ·{' '}
            <span className="text-rose-700 dark:text-rose-300">
              {grouped.open.length} {grouped.open.length > 1 ? t.openMany : t.open1}
            </span>
            {' · '}
            <span className="text-amber-700 dark:text-amber-300">
              {grouped.in_progress.length} {t.inProgressLabel}
            </span>
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <RefreshButton />
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map((col) => (
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
                  {t.kanbanEmpty}
                </div>
              ) : (
                grouped[col.key].map((tk) => <TicketCard key={tk.id} ticket={tk} demo={useDemo} lang={lang} />)
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
