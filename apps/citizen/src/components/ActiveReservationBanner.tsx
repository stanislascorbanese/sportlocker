'use client'

import { ChevronRight, QrCode } from 'lucide-react'

import type { ReservationActive } from '../lib/api'

const STATUS_LABELS: Record<ReservationActive['status'], string> = {
  scheduled: 'à venir',
  pending: 'à scanner',
  active: 'en cours',
  returned: 'rendue',
  overdue: 'en retard',
  cancelled: 'annulée',
  expired: 'expirée',
}

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
  const isScheduled = reservation.status === 'scheduled'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Voir mon QR code de réservation"
      className="mx-5 mb-3 flex animate-slide-up items-center gap-3 rounded-card border border-emerald-400/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 p-3 text-left transition-[border-color,transform] duration-base ease-out-soft hover:border-emerald-400/70 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
        <QrCode className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-eyebrow font-medium text-emerald-300/80">
          Réservation {STATUS_LABELS[reservation.status] ?? reservation.status}
        </p>
        <p className="truncate text-sm font-medium">
          {reservation.item.typeName} · {reservation.distributor.name}
        </p>
        <p className="text-meta text-white/55">
          {isScheduled
            ? `Présente ton QR à ${fmtTime(reservation.expiresAt)}`
            : `QR valide jusqu'à ${fmtTime(reservation.expiresAt)}`}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-emerald-300/70" aria-hidden="true" />
    </button>
  )
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
