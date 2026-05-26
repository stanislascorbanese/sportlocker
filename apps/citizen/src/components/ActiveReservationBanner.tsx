'use client'

import { ChevronRight, QrCode } from 'lucide-react'

import { useT } from '../lib/i18n/I18nProvider'
import type { ReservationActive } from '../lib/api'

const STATUS_KEY_BY_STATUS = {
  scheduled: 'reservation.status.scheduled',
  pending: 'reservation.status.pending',
  active: 'reservation.status.active',
  returned: 'reservation.status.returned',
  overdue: 'reservation.status.overdue',
  cancelled: 'reservation.status.cancelled',
  expired: 'reservation.status.expired',
} as const

/**
 * Banner épinglée au-dessus de la carte de la home quand l'utilisateur a
 * une réservation vivante. Surface l'item, le distributeur, et un raccourci
 * vers le QR. Tappable, animation d'entrée slide-up.
 */
export function ActiveReservationBanner({
  reservation,
  onClick,
}: {
  reservation: ReservationActive
  onClick: () => void
}) {
  const t = useT()
  const isScheduled = reservation.status === 'scheduled'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('reservation.banner.aria')}
      className="mx-5 mb-3 flex animate-slide-up items-center gap-3 rounded-card border p-3 text-left transition-[border-color,transform,box-shadow] duration-base ease-out-soft active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 border-emerald-300 bg-emerald-50 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-pop dark:border-emerald-400/40 dark:bg-gradient-to-r dark:from-emerald-500/15 dark:to-emerald-500/5 dark:hover:border-emerald-400/70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
        <QrCode className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-eyebrow font-medium uppercase text-emerald-700 dark:text-emerald-300/80">
          {t('reservation.banner.label', {
            status: t(STATUS_KEY_BY_STATUS[reservation.status]),
          })}
        </p>
        <p className="truncate text-sm font-medium text-navy-900 dark:text-white">
          {reservation.item.typeName} · {reservation.distributor.name}
        </p>
        <p className="text-meta text-gray-600 dark:text-white/55">
          {isScheduled
            ? t('reservation.banner.scheduled_at', { time: fmtTime(reservation.expiresAt) })
            : t('reservation.banner.valid_until', { time: fmtTime(reservation.expiresAt) })}
        </p>
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300/70"
        aria-hidden="true"
      />
    </button>
  )
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}
