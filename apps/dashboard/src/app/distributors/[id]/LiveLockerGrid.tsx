'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import type {
  DistributorLocker, DistributorStatus, LiveEvent,
} from '@sportlocker/types'

import { StatusPill } from '../../../components/StatusPill'
import { BatteryGauge } from '../../../components/BatteryGauge'
import { cn } from '../../../lib/cn'
import type { Lang } from '../../../lib/lang'
import { commonStrings, distributorStatusLabel, fmtRelative } from '../../../lib/i18n/common'
import { distributorsStrings } from '../../../lib/i18n/distributors'
import { applyLockerEvent } from '../../../lib/live/apply-locker-event'
import { useLiveEvents, type LiveStatus } from '../../../lib/live/useLiveEvents'
import {
  classifyLocker, summarizeLockerGrid, type LockerCellTone,
} from './_locker-grid'

const TONE_CLS: Record<LockerCellTone, { cls: string; dot: string }> = {
  'idle-empty':  { cls: 'border-dashed border-white/15 bg-navy-900',   dot: 'bg-white/30' },
  'idle-loaded': { cls: 'border-emerald-500/30 bg-emerald-500/[0.06]', dot: 'bg-emerald-400' },
  'reserved':    { cls: 'border-sky-500/30 bg-sky-500/[0.06]',         dot: 'bg-sky-400' },
  'active':      { cls: 'border-amber-500/30 bg-amber-500/[0.06]',     dot: 'bg-amber-400' },
  'returning':   { cls: 'border-purple-500/30 bg-purple-500/[0.06]',   dot: 'bg-purple-400' },
  'fault':       { cls: 'border-rose-500/30 bg-rose-500/[0.06]',       dot: 'bg-rose-400' },
}

function toneLabel(lang: Lang, tone: LockerCellTone): string {
  const t = distributorsStrings(lang)
  switch (tone) {
    case 'idle-empty':  return t.tonneIdleEmpty
    case 'idle-loaded': return t.toneIdleLoaded
    case 'reserved':    return t.toneReserved
    case 'active':      return t.toneActive
    case 'returning':   return t.toneReturning
    case 'fault':       return t.toneFault
  }
}

export interface LiveLockerGridProps {
  distributorId: string
  initialLockers: DistributorLocker[]
  initialStatus: DistributorStatus
  initialLastSeenAt: string | null
  batteryPercent: number | null
  lang: Lang
  /** Mode démo (distributeur factice) : pas de flux temps réel. */
  demo: boolean
}

/**
 * Vue temps réel des casiers d'un distributeur.
 *
 * Rendu initial *seedé* par le snapshot serveur (`initialLockers`/`initialStatus`)
 * pour un affichage immédiat SSR, puis patché en direct via le flux WebSocket :
 *   - events `locker`      → remplacement de la cellule concernée (grille + KPIs).
 *   - events `distributor` → pastille de statut + dernier signe.
 *
 * Un badge indique l'état de la connexion. À la reprise après coupure, on
 * déclenche `router.refresh()` : le flux ne rejoue pas l'historique manqué, donc
 * on resynchronise depuis le serveur (source de vérité) plutôt que de risquer un
 * état divergent.
 */
export function LiveLockerGrid({
  distributorId, initialLockers, initialStatus, initialLastSeenAt,
  batteryPercent, lang, demo,
}: LiveLockerGridProps) {
  const t = distributorsStrings(lang)
  const c = commonStrings(lang)
  const router = useRouter()

  const [lockers, setLockers] = useState<DistributorLocker[]>(initialLockers)
  const [status, setStatus] = useState<DistributorStatus>(initialStatus)
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(initialLastSeenAt)

  const onEvent = useCallback((event: LiveEvent) => {
    if (event.kind === 'locker') {
      setLockers((prev) => applyLockerEvent(prev, event))
    } else {
      setStatus(event.status)
      setLastSeenAt(event.lastSeenAt)
    }
  }, [])

  const onResync = useCallback(() => { router.refresh() }, [router])

  const connection = useLiveEvents({
    distributorId,
    onEvent,
    onResync,
    enabled: !demo,
  })

  const summary = summarizeLockerGrid(lockers)

  return (
    <div className="space-y-6">
      {/* Meta live : statut distributeur + compteurs + badge connexion */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-white/55">
        <StatusPill status={status} label={distributorStatusLabel(lang, status)} />
        <span>
          <span className={cn(summary.idleEmpty === 0 ? 'text-white/40' : 'font-semibold text-emerald-300')}>
            {summary.idleEmpty}
          </span>{' '}
          <span className="text-white/40">/ {summary.total} {t.emptyCount}</span>
        </span>
        <span className="text-white/40">·</span>
        <span>{summary.idleLoaded} {t.loadedSuffix} · {summary.active + summary.reserved} {t.inCirculation}</span>
        {summary.fault > 0 && (
          <>
            <span className="text-white/40">·</span>
            <span className="text-rose-300">{summary.fault} {t.faultSuffix}</span>
          </>
        )}
        {!demo && <ConnectionBadge status={connection} lang={lang} />}
      </div>

      {connection === 'offline' && !demo && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/80">
          {t.liveOfflineHint}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.kpiFreeForLoad} value={`${summary.loadable}`} accent="emerald" />
        <KpiCard label={t.kpiLoadedIdle}  value={`${summary.idleLoaded}`} />
        <KpiCard label={t.kpiActiveReservations} value={`${summary.reserved + summary.active}`} />
        <KpiCard label={t.kpiBatteryLastSeen}>
          <div className="flex items-center gap-3">
            <BatteryGauge percent={batteryPercent} />
            <span className="text-xs text-white/60">{fmtRelative(lang, lastSeenAt)}</span>
          </div>
        </KpiCard>
      </section>

      <section className="rounded-xl border border-white/10 bg-navy-800 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg">{t.sectionGrid}</h3>
          <Legend lang={lang} />
        </div>
        <LockerGrid lockers={lockers} lang={lang} />
      </section>
    </div>
  )
}

function ConnectionBadge({ status, lang }: { status: LiveStatus; lang: Lang }) {
  const t = distributorsStrings(lang)
  const map: Record<LiveStatus, { label: string; dot: string; text: string }> = {
    connecting:   { label: t.liveConnecting,   dot: 'bg-white/40 animate-pulse',      text: 'text-white/50' },
    live:         { label: t.liveOn,           dot: 'bg-emerald-400',                 text: 'text-emerald-300' },
    reconnecting: { label: t.liveReconnecting, dot: 'bg-amber-400 animate-pulse',     text: 'text-amber-300' },
    offline:      { label: t.liveOffline,      dot: 'bg-rose-400',                    text: 'text-rose-300' },
  }
  const s = map[status]
  return (
    <span
      className={cn('ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium', s.text)}
      role="status"
      aria-live="polite"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}

function KpiCard({
  label, value, accent, children,
}: { label: string; value?: string; accent?: 'emerald'; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">{label}</p>
      {value !== undefined ? (
        <p className={cn(
          'mt-2 font-display text-2xl tabular-nums transition-colors',
          accent === 'emerald' ? 'text-emerald-300' : 'text-white',
        )}>
          {value}
        </p>
      ) : (
        <div className="mt-2">{children}</div>
      )}
    </div>
  )
}

function Legend({ lang }: { lang: Lang }) {
  const tones: LockerCellTone[] = ['idle-empty', 'idle-loaded', 'reserved', 'active', 'returning', 'fault']
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
      {tones.map((tone) => (
        <li key={tone} className="inline-flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', TONE_CLS[tone].dot)} />
          {toneLabel(lang, tone)}
        </li>
      ))}
    </ul>
  )
}

function LockerGrid({ lockers, lang }: { lockers: DistributorLocker[]; lang: Lang }) {
  const t = distributorsStrings(lang)
  if (lockers.length === 0) {
    return <p className="text-sm text-white/40">{t.gridEmpty}</p>
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {lockers.map((l) => {
        const cell = classifyLocker(l)
        const tcls = TONE_CLS[cell.tone]
        const label = toneLabel(lang, cell.tone)
        return (
          <li
            key={l.id}
            className={cn(
              'group relative flex flex-col gap-2 rounded-lg border p-3 transition-colors duration-500',
              tcls.cls,
              cell.loadable && 'hover:border-emerald-400/60 hover:bg-emerald-500/10',
            )}
            aria-label={`${t.gridCellLockerAria} ${l.position + 1} — ${label}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/55">
                #{l.position + 1}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/55">
                <span className={cn('h-1.5 w-1.5 rounded-full', tcls.dot)} />
                {label}
              </span>
            </div>
            {l.itemType ? (
              <div className="min-h-[2.5rem]">
                <p className="truncate text-sm font-medium text-white" title={l.itemType.name}>
                  {l.itemType.name}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/40">
                  {l.itemType.category}
                </p>
              </div>
            ) : (
              <p className="min-h-[2.5rem] text-sm text-white/30">
                {cell.tone === 'fault' ? t.cellFaultPlaceholder : t.cellEmptyPlaceholder}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
