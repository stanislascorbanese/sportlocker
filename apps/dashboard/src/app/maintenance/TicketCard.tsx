'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { cn } from '../../lib/cn'
import type { MaintenanceStatus, MaintenanceTicket } from '../../lib/api'
import type { Lang } from '../../lib/lang'
import { fmtDateTime } from '../../lib/i18n/common'
import { maintenanceStrings } from '../../lib/i18n/maintenance'
import { changeTicketStatusAction } from './_actions'

// Échelle de sévérité 1→5 (zinc/sky/amber/orange/rose), chaque tone
// avec sa variante claire (50/200/700) et sombre (500/10·500/30·X-300).
const SEVERITY_STYLE: Record<number, string> = {
  1: 'border-zinc-200 text-zinc-700 bg-zinc-50 dark:border-zinc-500/30 dark:text-zinc-300 dark:bg-zinc-500/10',
  2: 'border-sky-200 text-sky-700 bg-sky-50 dark:border-sky-500/30 dark:text-sky-300 dark:bg-sky-500/10',
  3: 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:bg-amber-500/10',
  4: 'border-orange-200 text-orange-700 bg-orange-50 dark:border-orange-500/30 dark:text-orange-300 dark:bg-orange-500/10',
  5: 'border-rose-200 text-rose-700 bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/10',
}

export function TicketCard({
  ticket,
  demo = false,
  lang,
}: {
  ticket: MaintenanceTicket
  demo?: boolean
  lang: Lang
}) {
  const t = maintenanceStrings(lang)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const transition = (next: MaintenanceStatus) => {
    if (demo) {
      alert(t.demoBlocker)
      return
    }
    startTransition(() => {
      void (async () => {
        const res = await changeTicketStatusAction(ticket.id, next)
        if (!res.ok) {
          alert(res.error)
          return
        }
        router.refresh()
      })()
    })
  }

  const sev = SEVERITY_STYLE[ticket.severity] ?? SEVERITY_STYLE[3]!

  return (
    <article className="rounded-card border bg-white p-3 shadow-card transition-colors duration-base hover:border-gray-300 dark:border-white/10 dark:bg-navy-800 dark:shadow-none dark:hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-tight text-navy-900 dark:text-white">{ticket.title}</h3>
        <span className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          sev,
        )}>
          {t.severityPrefix}{ticket.severity}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-meta text-gray-600 dark:text-white/55">
        <div className="truncate">
          <span className="text-navy-900 dark:text-white/70">{ticket.distributor.name}</span>
          <span className="mx-1 text-gray-400 dark:text-white/30">·</span>
          <span className="font-mono text-gray-500 dark:text-white/40">{ticket.distributor.serialNumber}</span>
        </div>
        <div>{t.openedOn} {fmtDateTime(lang, ticket.createdAt)}</div>
        {ticket.assignee && (
          <div className="text-emerald-700 dark:text-emerald-300/80">
            {t.arrowTo} {ticket.assignee.displayName ?? ticket.assignee.email}
          </div>
        )}
      </div>

      {ticket.description && (
        <p className="mt-2 line-clamp-3 text-xs text-gray-600 dark:text-white/60">{ticket.description}</p>
      )}

      {ticket.resolutionNote && ticket.status === 'resolved' && (
        <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-meta text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-200/80">
          {ticket.resolutionNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {ticket.status === 'open' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => transition('in_progress')}
            className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-meta font-medium text-emerald-700 transition-colors duration-base hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            {t.takeOver}
          </button>
        )}
        {ticket.status === 'in_progress' && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition('resolved')}
              className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-meta font-medium text-emerald-700 transition-colors duration-base hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              {t.resolve}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition('open')}
              className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-meta text-gray-600 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
              title={t.titleSendBack}
            >
              ←
            </button>
          </>
        )}
        {(ticket.status === 'resolved' || ticket.status === 'wontfix') && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => transition('open')}
            className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-meta text-gray-600 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            {t.reopen}
          </button>
        )}
        {ticket.status === 'open' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => transition('wontfix')}
            className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-meta text-gray-500 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/40 dark:hover:bg-white/10"
            title={t.titleWontfix}
          >
            ✕
          </button>
        )}
      </div>
    </article>
  )
}
