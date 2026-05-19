import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import type { Distributor } from '../lib/api'
import { cn } from '../lib/cn'

const STATUS_STYLE: Record<Distributor['status'], { dot: string; label: string; ring: string }> = {
  online:         { dot: 'bg-emerald-400',  label: 'En service',  ring: 'ring-emerald-500/20' },
  offline:        { dot: 'bg-rose-400',     label: 'Hors ligne',  ring: 'ring-rose-500/30' },
  maintenance:    { dot: 'bg-amber-400',    label: 'Maintenance', ring: 'ring-amber-500/30' },
  decommissioned: { dot: 'bg-zinc-400',     label: 'Retiré',      ring: 'ring-zinc-500/20' },
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
}

export function DistributorCard({
  distributor,
  weeklyReservations,
  openTickets,
}: {
  distributor: Distributor
  /** Nombre de réservations créées sur ce distributeur les 7 derniers jours. */
  weeklyReservations: number
  /** Nombre de tickets de maintenance ouverts. */
  openTickets: number
}) {
  const s = STATUS_STYLE[distributor.status]
  const fillRate = distributor.lockerCount > 0
    ? Math.round(100 * (distributor.lockerCount - distributor.idleLockers) / distributor.lockerCount)
    : 0
  const lowAvailability = distributor.idleLockers <= 1
  const offline = distributor.status === 'offline'

  return (
    <Link
      href={`/distributors/${distributor.id}/edit`}
      className={cn(
        'group relative block overflow-hidden rounded-xl border border-white/10 bg-navy-800 p-4 transition',
        'hover:border-white/30 hover:bg-navy-800/70',
        offline && 'ring-1 ring-inset',
        offline && s.ring,
      )}
    >
      {/* Top : nom + status pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-white">{distributor.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-white/40">{distributor.serialNumber}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
          <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
          {s.label}
        </span>
      </div>

      {/* Stats trio : casiers / occupation / résa 7j */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          label="Casiers libres"
          value={`${distributor.idleLockers}/${distributor.lockerCount}`}
          tone={lowAvailability ? (distributor.idleLockers === 0 ? 'bad' : 'warn') : 'good'}
        />
        <Stat
          label="Occupation"
          value={`${fillRate}%`}
          tone={fillRate >= 90 ? 'warn' : 'neutral'}
        />
        <Stat
          label="Résa 7j"
          value={weeklyReservations.toString()}
          tone="neutral"
        />
      </div>

      {/* Footer : signaux + dernière activité */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px]">
        <div className="flex items-center gap-3 text-white/55">
          {openTickets > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
              ⚠ {openTickets} ticket{openTickets > 1 ? 's' : ''}
            </span>
          )}
          <span>Vu {fmtRelative(distributor.lastSeenAt)}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-white/30 transition group-hover:translate-x-0.5 group-hover:text-white/60" />
      </div>
    </Link>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const color =
    tone === 'good'    ? 'text-emerald-300'
    : tone === 'warn'  ? 'text-amber-300'
    : tone === 'bad'   ? 'text-rose-300'
    : 'text-white'
  return (
    <div className="rounded-lg bg-white/[0.02] px-2 py-1.5">
      <p className="truncate text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={cn('mt-0.5 font-display text-base tabular-nums', color)}>{value}</p>
    </div>
  )
}
