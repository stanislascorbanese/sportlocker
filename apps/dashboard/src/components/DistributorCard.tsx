import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import type { Distributor } from '../lib/api'
import { cn } from '../lib/cn'
import type { Lang } from '../lib/lang'
import { distributorStatusLabel, fmtRelative } from '../lib/i18n/common'

const STATUS_VISUAL: Record<Distributor['status'], { dot: string; ring: string }> = {
  online:         { dot: 'bg-emerald-400',  ring: 'ring-emerald-500/20' },
  offline:        { dot: 'bg-rose-400',     ring: 'ring-rose-500/30' },
  maintenance:    { dot: 'bg-amber-400',    ring: 'ring-amber-500/30' },
  decommissioned: { dot: 'bg-zinc-400',     ring: 'ring-zinc-500/20' },
}

// Strings spécifiques DistributorCard. On garde dans common (réutilisables
// ailleurs si besoin) plutôt qu'un nouveau dico pour 4 clés.
const CARD_STRINGS: Record<Lang, { freeLockers: string; occupancy: string; res7d: string; seen: string; ticket1: string; ticketMany: string }> = {
  fr: {
    freeLockers: 'Casiers libres',
    occupancy:   'Occupation',
    res7d:       'Résa 7j',
    seen:        'Vu',
    ticket1:     'ticket',
    ticketMany:  'tickets',
  },
  en: {
    freeLockers: 'Free lockers',
    occupancy:   'Occupancy',
    res7d:       'Res. 7d',
    seen:        'Seen',
    ticket1:     'ticket',
    ticketMany:  'tickets',
  },
}

export function DistributorCard({
  distributor,
  weeklyReservations,
  openTickets,
  lang,
}: {
  distributor: Distributor
  weeklyReservations: number
  openTickets: number
  lang: Lang
}) {
  const v = STATUS_VISUAL[distributor.status]
  const c = CARD_STRINGS[lang]
  const statusText = distributorStatusLabel(lang, distributor.status)
  // Variante "En service" plus chaleureuse en FR (status pill home only)
  const friendlyStatus = lang === 'fr' && distributor.status === 'online' ? 'En service' : statusText

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
        offline && v.ring,
      )}
    >
      {/* Top : nom + status pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg text-white">{distributor.name}</h3>
          <p className="mt-0.5 font-mono text-[11px] text-white/40">{distributor.serialNumber}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/70">
          <span className={cn('h-1.5 w-1.5 rounded-full', v.dot)} />
          {friendlyStatus}
        </span>
      </div>

      {/* Stats trio : casiers / occupation / résa 7j */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat
          label={c.freeLockers}
          value={`${distributor.idleLockers}/${distributor.lockerCount}`}
          tone={lowAvailability ? (distributor.idleLockers === 0 ? 'bad' : 'warn') : 'good'}
        />
        <Stat
          label={c.occupancy}
          value={`${fillRate}%`}
          tone={fillRate >= 90 ? 'warn' : 'neutral'}
        />
        <Stat
          label={c.res7d}
          value={weeklyReservations.toString()}
          tone="neutral"
        />
      </div>

      {/* Footer : signaux + dernière activité */}
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px]">
        <div className="flex items-center gap-3 text-white/55">
          {openTickets > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-rose-300">
              ⚠ {openTickets} {openTickets > 1 ? c.ticketMany : c.ticket1}
            </span>
          )}
          <span>{c.seen} {fmtRelative(lang, distributor.lastSeenAt)}</span>
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
