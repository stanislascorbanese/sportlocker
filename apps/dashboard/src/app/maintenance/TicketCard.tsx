'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { cn } from '../../lib/cn'
import type { MaintenanceStatus, MaintenanceTicket } from '../../lib/api'
import { changeTicketStatusAction } from './_actions'

const SEVERITY_STYLE: Record<number, string> = {
  1: 'border-zinc-500/30 text-zinc-300 bg-zinc-500/10',
  2: 'border-sky-500/30 text-sky-300 bg-sky-500/10',
  3: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
  4: 'border-orange-500/30 text-orange-300 bg-orange-500/10',
  5: 'border-rose-500/30 text-rose-300 bg-rose-500/10',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export function TicketCard({ ticket, demo = false }: { ticket: MaintenanceTicket; demo?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const transition = (next: MaintenanceStatus) => {
    if (demo) {
      alert('Mode démo — branchez un token admin valide pour modifier les tickets.')
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
    <article className="rounded-xl border border-white/10 bg-navy-800 p-3 transition hover:border-white/20">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-tight text-white">{ticket.title}</h3>
        <span className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          sev,
        )}>
          S{ticket.severity}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-[11px] text-white/55">
        <div className="truncate">
          <span className="text-white/70">{ticket.distributor.name}</span>
          <span className="mx-1 text-white/30">·</span>
          <span className="font-mono text-white/40">{ticket.distributor.serialNumber}</span>
        </div>
        <div>Ouvert le {fmtDate(ticket.createdAt)}</div>
        {ticket.assignee && (
          <div className="text-emerald-300/80">
            → {ticket.assignee.displayName ?? ticket.assignee.email}
          </div>
        )}
      </div>

      {ticket.description && (
        <p className="mt-2 line-clamp-3 text-xs text-white/60">{ticket.description}</p>
      )}

      {ticket.resolutionNote && ticket.status === 'resolved' && (
        <p className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-200/80">
          {ticket.resolutionNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {ticket.status === 'open' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => transition('in_progress')}
            className="flex-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Prendre en charge →
          </button>
        )}
        {ticket.status === 'in_progress' && (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition('resolved')}
              className="flex-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              ✓ Résoudre
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => transition('open')}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 disabled:opacity-50"
              title="Renvoyer dans la pile des tickets ouverts"
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
            className="flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/10 disabled:opacity-50"
          >
            Rouvrir
          </button>
        )}
        {ticket.status === 'open' && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => transition('wontfix')}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/40 transition hover:bg-white/10 disabled:opacity-50"
            title="Ne pas traiter"
          >
            ✕
          </button>
        )}
      </div>
    </article>
  )
}
