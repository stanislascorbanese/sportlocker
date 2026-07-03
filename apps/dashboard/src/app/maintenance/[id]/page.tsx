import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  ApiError,
  fetchMaintenanceTicket,
  fetchUsers,
  type MaintenanceTicketDetail,
} from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { RefreshButton } from '../../../components/RefreshButton'
import { getLang } from '../../../lib/lang-server'
import { commonStrings, fmtDateTime } from '../../../lib/i18n/common'
import { maintenanceStrings, maintenanceStatusLabel } from '../../../lib/i18n/maintenance'
import { makeMetadata } from '../../../lib/i18n/metadata'
import { StatusActions } from './StatusActions'
import { AssigneeSelector, type AssignableAdmin } from './AssigneeSelector'
import { CommentForm } from './CommentForm'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => maintenanceStrings(lang).detailMetaTitle)

const SEVERITY_STYLE: Record<number, string> = {
  1: 'border-zinc-200 text-zinc-700 bg-zinc-50 dark:border-zinc-500/30 dark:text-zinc-300 dark:bg-zinc-500/10',
  2: 'border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:bg-sky-500/10',
  3: 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:bg-amber-500/10',
  4: 'border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:bg-orange-500/10',
  5: 'border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/10',
}

const STATUS_STYLE: Record<string, string> = {
  open:        'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  resolved:    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  wontfix:     'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-500/30 dark:bg-zinc-500/10 dark:text-zinc-300',
}

/** Détail de démo (API injoignable) — à partir du catalogue démo, fils vides. */
async function demoDetail(id: string): Promise<MaintenanceTicketDetail> {
  const demo = await import('../../../lib/demo-data')
  const base = demo.DEMO_MAINTENANCE_TICKETS.find((t) => t.id === id) ?? demo.DEMO_MAINTENANCE_TICKETS[0]!
  return { ...base, id, locker: null, item: null, comments: [], statusHistory: [] }
}

export default async function MaintenanceTicketPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const lang = await getLang()
  const t = maintenanceStrings(lang)
  const c = commonStrings(lang)

  let ticket: MaintenanceTicketDetail | null = null
  let fetchError: string | null = null

  try {
    ticket = await fetchMaintenanceTicket(id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound()
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const useDemo = ticket === null
  if (!ticket) ticket = await demoDetail(id)

  // Admins de la commune pour le sélecteur d'assignation (échoue silencieusement
  // en démo → sélecteur avec la seule option "non assigné").
  let admins: AssignableAdmin[] = []
  if (!useDemo) {
    try {
      const users = await fetchUsers({ role: 'admin' })
      admins = users.map((u) => ({ id: u.id, email: u.email, displayName: u.displayName }))
    } catch { /* ignore */ }
  }
  // Garantit que l'assigné courant figure dans les options même hors liste.
  if (ticket.assignee && !admins.some((a) => a.id === ticket!.assignee!.id)) {
    admins = [{ ...ticket.assignee }, ...admins]
  }

  const sev = SEVERITY_STYLE[ticket.severity] ?? SEVERITY_STYLE[3]!
  const openedByLabel = ticket.isAuto
    ? t.openedByAuto
    : (ticket.openedBy?.displayName ?? ticket.openedBy?.email ?? '—')

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/maintenance" className="text-sm text-gray-500 transition hover:text-navy-900 dark:text-white/55 dark:hover:text-white">
              {t.detailBack}
            </Link>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
            {ticket.isAuto && (
              <span title={t.badgeAutoTitle} className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
                {t.badgeAuto}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide', STATUS_STYLE[ticket.status])}>
              {maintenanceStatusLabel(lang, ticket.status)}
            </span>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', sev)}>
              {t.severityPrefix}{ticket.severity}
            </span>
          </div>
          <h2 className="mt-2 font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">{ticket.title}</h2>
        </div>
        <RefreshButton />
      </header>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {/* Actions : transitions de statut + assignation */}
      <section className="flex flex-col gap-4 rounded-card border bg-white p-4 shadow-card sm:flex-row sm:items-end sm:justify-between dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <StatusActions id={ticket.id} status={ticket.status} demo={useDemo} lang={lang} />
        <AssigneeSelector
          id={ticket.id}
          currentAssigneeId={ticket.assignee?.id ?? null}
          admins={admins}
          demo={useDemo}
          lang={lang}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <section className="rounded-card border bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
            <h3 className="text-eyebrow uppercase text-gray-500 dark:text-white/40">{t.secDescription}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-white/75">
              {ticket.description ?? <span className="text-gray-400 dark:text-white/40">{t.noDescription}</span>}
            </p>
            {ticket.status === 'resolved' && ticket.resolutionNote && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-200/80">
                <p className="text-eyebrow uppercase text-emerald-600 dark:text-emerald-300/70">{t.resolutionNoteLabel}</p>
                <p className="mt-1 whitespace-pre-wrap">{ticket.resolutionNote}</p>
              </div>
            )}
          </section>

          {/* Commentaires internes */}
          <section className="rounded-card border bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
            <h3 className="text-eyebrow uppercase text-gray-500 dark:text-white/40">
              {t.secComments} · {ticket.comments.length}
            </h3>
            <div className="mt-3 space-y-3">
              {ticket.comments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400 dark:border-white/10 dark:text-white/30">
                  {t.commentsEmpty}
                </p>
              ) : (
                ticket.comments.map((cm) => (
                  <div key={cm.id} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-white/5 dark:bg-white/[0.02]">
                    <div className="flex items-baseline justify-between gap-2 text-meta">
                      <span className="font-medium text-navy-900 dark:text-white/80">
                        {cm.authorName ?? cm.authorEmail}
                      </span>
                      <span className="shrink-0 text-gray-400 dark:text-white/35">{fmtDateTime(lang, cm.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-white/75">{cm.body}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4">
              <CommentForm id={ticket.id} demo={useDemo} lang={lang} />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          {/* Contexte */}
          <section className="rounded-card border bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
            <h3 className="text-eyebrow uppercase text-gray-500 dark:text-white/40">{t.secContext}</h3>
            <dl className="mt-3 space-y-3 text-sm">
              <InfoRow label={t.fieldDistributor}>
                <Link href={`/distributors/${ticket.distributor.id}/edit`} className="text-emerald-700 hover:underline dark:text-emerald-300">
                  {ticket.distributor.name}
                </Link>
                <span className="ml-1 font-mono text-meta text-gray-400 dark:text-white/40">{ticket.distributor.serialNumber}</span>
              </InfoRow>
              <InfoRow label={t.fieldLocker}>
                {ticket.locker ? `${t.lockerPosition} ${ticket.locker.position}` : '—'}
              </InfoRow>
              <InfoRow label={t.fieldItem}>
                {ticket.item ? (
                  <>
                    {ticket.item.typeName}
                    <span className="ml-1 font-mono text-meta text-gray-400 dark:text-white/40">{ticket.item.rfidTag}</span>
                  </>
                ) : '—'}
              </InfoRow>
              <InfoRow label={t.fieldOpenedBy}>{openedByLabel}</InfoRow>
              <InfoRow label={t.fieldCreated}>{fmtDateTime(lang, ticket.createdAt)}</InfoRow>
            </dl>
          </section>

          {/* Historique des transitions */}
          <section className="rounded-card border bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
            <h3 className="text-eyebrow uppercase text-gray-500 dark:text-white/40">{t.secHistory}</h3>
            {ticket.statusHistory.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-gray-300 p-4 text-center text-xs text-gray-400 dark:border-white/10 dark:text-white/30">
                {t.historyEmpty}
              </p>
            ) : (
              <ol className="mt-3 space-y-3 border-l-2 border-gray-200 pl-4 dark:border-white/10">
                {ticket.statusHistory.map((h, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <div className="text-sm text-navy-900 dark:text-white/85">
                      {h.from ? `${maintenanceStatusLabel(lang, h.from)} ${t.arrowTo} ` : ''}
                      <span className="font-medium">{maintenanceStatusLabel(lang, h.to)}</span>
                    </div>
                    <div className="mt-0.5 text-meta text-gray-500 dark:text-white/45">
                      {fmtDateTime(lang, h.at)}
                      {h.byEmail ? ` · ${t.historyBy} ${h.byEmail}` : ''}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-eyebrow uppercase text-gray-400 dark:text-white/35">{label}</dt>
      <dd className="text-gray-700 dark:text-white/80">{children}</dd>
    </div>
  )
}
