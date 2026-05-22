'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronRight, History } from 'lucide-react'
import Link from 'next/link'

import { fetchMyReservations, type ReservationHistoryItem } from '../../lib/api'
import { cn } from '../../lib/cn'

/**
 * Section "Mes emprunts" affichée sur /profile.
 *
 * Liste les 50 dernières réservations du user, enrichies avec le nom du
 * distributeur et le type d'item (GET /v1/reservations/me, shape enrichi
 * Phase /profile). Trié createdAt DESC côté API.
 *
 * Les statuts "vivants" (scheduled/pending/active/overdue) sont cliquables
 * et redirigent vers /reservations/<id> pour récupérer le qrToken (via
 * /active enrichi). Les statuts terminaux (returned/cancelled/expired) sont
 * non-cliquables (rien d'utile à faire derrière).
 */
const STATUS_META: Record<
  ReservationHistoryItem['status'],
  { label: string; badge: string; live: boolean }
> = {
  scheduled: { label: 'Planifiée', badge: 'bg-sky-500/15 text-sky-300 border-sky-400/30', live: true },
  pending:   { label: 'En attente', badge: 'bg-amber-500/15 text-amber-300 border-amber-400/30', live: true },
  active:    { label: 'En cours', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30', live: true },
  overdue:   { label: 'En retard', badge: 'bg-rose-500/15 text-rose-300 border-rose-400/30', live: true },
  returned:  { label: 'Rendue', badge: 'bg-white/10 text-white/60 border-white/15', live: false },
  cancelled: { label: 'Annulée', badge: 'bg-white/10 text-white/50 border-white/15', live: false },
  expired:   { label: 'Expirée', badge: 'bg-white/10 text-white/50 border-white/15', live: false },
}

function formatRange(item: ReservationHistoryItem): string {
  // Modèle slots (PR 0008) : on a slotStartAt + slotEndAt.
  if (item.slotStartAt && item.slotEndAt) {
    return formatDateTimeRange(new Date(item.slotStartAt), new Date(item.slotEndAt))
  }
  // Legacy pending/active : on tombe sur openedAt → dueAt si dispos, sinon
  // createdAt pour situer dans le temps.
  if (item.openedAt && item.dueAt) {
    return formatDateTimeRange(new Date(item.openedAt), new Date(item.dueAt))
  }
  return formatDateTime(new Date(item.createdAt))
}

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function formatDateTime(d: Date): string {
  return DATE_FMT.format(d)
}

function formatDateTimeRange(start: Date, end: Date): string {
  // Même jour → "12 juin, 14:00–15:00"
  // Jour différent → "12 juin 14:00 → 13 juin 09:00"
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  if (sameDay) return `${DATE_FMT.format(start)} – ${TIME_FMT.format(end)}`
  return `${DATE_FMT.format(start)} → ${DATE_FMT.format(end)}`
}

export function ReservationsHistory() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: fetchMyReservations,
    staleTime: 30 * 1000,
  })

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <header className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-white/60" />
        <h2 className="font-display text-sm font-semibold text-white/80">Mes emprunts</h2>
      </header>

      {isLoading && (
        <p className="text-sm text-white/50">Chargement…</p>
      )}
      {isError && (
        <div className="space-y-2 text-sm">
          <p className="text-rose-300">Impossible de charger l'historique.</p>
          <button
            onClick={() => refetch()}
            className="text-xs text-emerald-300 hover:underline"
          >
            Réessayer
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-white/50">
          Aucun emprunt pour l'instant. Réserve un équipement depuis la carte d'accueil.
        </p>
      )}
      {data && data.length > 0 && (
        <ul className="-mx-2 divide-y divide-white/5">
          {data.map((item) => (
            <ReservationRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReservationRow({ item }: { item: ReservationHistoryItem }) {
  const meta = STATUS_META[item.status]
  const range = formatRange(item)

  const inner = (
    <div className="flex items-center gap-3 px-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">
          {item.item.typeName}
        </p>
        <p className="truncate text-xs text-white/60">
          {item.distributor.name} · {range}
        </p>
      </div>
      <span
        className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
          meta.badge,
        )}
      >
        {meta.label}
      </span>
      {meta.live && <ChevronRight className="h-4 w-4 shrink-0 text-white/40" aria-hidden />}
    </div>
  )

  if (meta.live) {
    return (
      <li>
        <Link
          href={`/reservations/${item.id}`}
          className="block transition hover:bg-white/5"
          aria-label={`Voir la réservation ${item.item.typeName} chez ${item.distributor.name}`}
        >
          {inner}
        </Link>
      </li>
    )
  }
  return <li>{inner}</li>
}
