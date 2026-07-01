'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { Distributor, LiveEvent } from '@sportlocker/types'

import { StatusPill } from '../../components/StatusPill'
import { BatteryGauge } from '../../components/BatteryGauge'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { commonStrings, distributorStatusLabel, fmtRelative } from '../../lib/i18n/common'
import { distributorsStrings } from '../../lib/i18n/distributors'
import { useLiveEvents, type LiveStatus } from '../../lib/live/useLiveEvents'

function fmtCoord(coord: number | null): string {
  return coord == null ? '—' : coord.toFixed(4)
}

function idleToneCls(idle: number): string {
  if (idle === 0) return 'font-semibold text-rose-700 dark:text-rose-300'
  if (idle === 1) return 'font-semibold text-amber-700 dark:text-amber-300'
  return 'font-semibold text-emerald-700 dark:text-emerald-300'
}

export interface LiveFleetProps {
  initialDistributors: Distributor[]
  lang: Lang
}

/**
 * Vue parc temps réel.
 *
 * Seedée par le snapshot serveur, puis patchée via le flux WebSocket : chaque
 * event `distributor` (transition online/offline/maintenance, cf. heartbeat &
 * LWT MQTT) met à jour le statut, le nombre de casiers libres et le dernier
 * signe de la borne concernée. Les events `locker` (réservation/retour d'un
 * casier isolé) ne sont pas appliqués ici — le compteur de casiers libres se
 * resynchronise au prochain event distributeur ou rafraîchissement ; le signal
 * prioritaire d'une vue parc reste « quelles bornes sont en ligne ».
 */
export function LiveFleet({ initialDistributors, lang }: LiveFleetProps) {
  const t = distributorsStrings(lang)
  const c = commonStrings(lang)
  const router = useRouter()

  const [distributors, setDistributors] = useState<Distributor[]>(initialDistributors)

  const onEvent = useCallback((event: LiveEvent) => {
    if (event.kind !== 'distributor') return
    setDistributors((prev) => {
      const idx = prev.findIndex((d) => d.id === event.distributorId)
      if (idx === -1) return prev
      const current = prev[idx]!
      if (
        current.status === event.status
        && current.idleLockers === (event.idleLockers ?? current.idleLockers)
        && current.lastSeenAt === event.lastSeenAt
      ) {
        return prev
      }
      const next = prev.slice()
      next[idx] = {
        ...current,
        status: event.status,
        idleLockers: event.idleLockers ?? current.idleLockers,
        lastSeenAt: event.lastSeenAt,
      }
      return next
    })
  }, [])

  const onResync = useCallback(() => { router.refresh() }, [router])

  const connection = useLiveEvents({ onEvent, onResync })

  const online = distributors.filter((d) => d.status === 'online').length
  const totalIdle = distributors.reduce((acc, d) => acc + d.idleLockers, 0)
  const totalLockers = distributors.reduce((acc, d) => acc + d.lockerCount, 0)
  const countLabel = distributors.length > 1 ? t.distributorsCountMany : t.distributorsCount1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600 dark:text-white/55">
        <span>
          {distributors.length} {countLabel} ·{' '}
          <span className="text-emerald-700 dark:text-emerald-300">{online} {c.statusOnline}</span> ·{' '}
          {totalIdle} / {totalLockers} {t.lockersFreeOf}
        </span>
        <ConnectionBadge status={connection} lang={lang} />
      </div>

      {/* Mobile : carte par distributeur. */}
      <div className="space-y-3 md:hidden">
        {distributors.map((d) => (
          <Link
            key={d.id}
            href={`/distributors/${d.id}`}
            className="block rounded-card border border-gray-200 bg-white p-4 shadow-card transition-colors hover:border-gray-300 dark:border-white/10 dark:bg-navy-800 dark:shadow-none dark:hover:border-white/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-navy-900 dark:text-white">{d.name}</div>
                <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                  {d.serialNumber}
                </div>
              </div>
              <StatusPill status={d.status} label={distributorStatusLabel(lang, d.status)} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-meta">
              <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {t.colLockersFree}
                </div>
                <div className="mt-0.5 font-display text-sm tabular-nums">
                  <span className={idleToneCls(d.idleLockers)}>{d.idleLockers}</span>
                  <span className="text-gray-500 dark:text-white/40"> / {d.lockerCount}</span>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {t.colBattery}
                </div>
                <div className="mt-1">
                  <BatteryGauge percent={d.batteryPercent} />
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                  {t.colLastSeen}
                </div>
                <div className="mt-0.5 truncate text-xs text-navy-900 dark:text-white/85">
                  {fmtRelative(lang, d.lastSeenAt)}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Desktop : tableau dense. */}
      <div className="hidden overflow-x-auto rounded-card border border-gray-200 bg-white md:block dark:border-white/10 dark:bg-navy-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-eyebrow uppercase bg-gray-100 text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
            <tr>
              <th className="px-4 py-3 font-medium">{t.colDistributor}</th>
              <th className="px-4 py-3 font-medium">{t.colStatus}</th>
              <th className="px-4 py-3 font-medium">{t.colLockersFree}</th>
              <th className="px-4 py-3 font-medium">{t.colBattery}</th>
              <th className="px-4 py-3 font-medium">{t.colPosition}</th>
              <th className="px-4 py-3 font-medium">{t.colLastSeen}</th>
              <th className="px-4 py-3 text-right font-medium">{t.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/5">
            {distributors.map((d) => (
              <tr
                key={d.id}
                className="transition-colors duration-base hover:bg-gray-50 dark:hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-navy-900 dark:text-white">{d.name}</div>
                  <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                    {d.serialNumber}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={d.status} label={distributorStatusLabel(lang, d.status)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-baseline gap-1">
                    <span className={idleToneCls(d.idleLockers)}>{d.idleLockers}</span>
                    <span className="text-gray-500 dark:text-white/40">/ {d.lockerCount}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <BatteryGauge percent={d.batteryPercent} />
                </td>
                <td className="px-4 py-3 font-mono text-meta tabular-nums text-gray-700 dark:text-white/70">
                  {fmtCoord(d.latitude)}, {fmtCoord(d.longitude)}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-white/60">
                  {fmtRelative(lang, d.lastSeenAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/distributors/${d.id}`}
                      className="text-meta transition-colors duration-base text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
                    >
                      {c.detail}
                    </Link>
                    <Link
                      href={`/distributors/${d.id}/health`}
                      className="text-meta transition-colors duration-base text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
                    >
                      {c.health}
                    </Link>
                    <Link
                      href={`/distributors/${d.id}/edit`}
                      className="text-meta transition-colors duration-base text-gray-500 hover:text-navy-900 dark:text-white/55 dark:hover:text-white"
                    >
                      {c.modify}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ConnectionBadge({ status, lang }: { status: LiveStatus; lang: Lang }) {
  const t = distributorsStrings(lang)
  const map: Record<LiveStatus, { label: string; dot: string; text: string }> = {
    connecting:   { label: t.liveConnecting,   dot: 'bg-gray-400 animate-pulse',  text: 'text-gray-500 dark:text-white/50' },
    live:         { label: t.liveOn,           dot: 'bg-emerald-400',             text: 'text-emerald-700 dark:text-emerald-300' },
    reconnecting: { label: t.liveReconnecting, dot: 'bg-amber-400 animate-pulse', text: 'text-amber-700 dark:text-amber-300' },
    offline:      { label: t.liveOffline,      dot: 'bg-rose-400',                text: 'text-rose-700 dark:text-rose-300' },
  }
  const s = map[status]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium', s.text)}
      role="status"
      aria-live="polite"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  )
}
