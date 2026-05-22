'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Clock, MapPin, Package, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'

import {
  MAX_EXTENSIONS,
  cancelReservation,
  extendReservation,
  fetchActiveReservation,
  type ReservationActive,
} from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'

/**
 * Affiche la réservation active de l'utilisateur avec son QR code à
 * scanner sur la borne pour déverrouiller le casier.
 *
 * Le QR contient un JWT HS256 signé par l'API (cf. règles métier
 * CLAUDE.md : valable 15 min, nonce anti-replay). On le rend en SVG pour
 * une netteté maximale même en zoom (impression écran).
 *
 * Refresh auto chaque 30s pour mettre à jour le timer et capter un
 * changement de statut (scheduled → pending → active dès que l'utilisateur scanne).
 *
 * Permet aussi d'annuler la résa : ouverture immédiate des `pending`
 * (legacy), jusqu'à 30 min avant slotStartAt pour les `scheduled` (cf. API
 * `POST /v1/reservations/:id/cancel`).
 */
const CANCEL_CUTOFF_MIN = 30

export default function ReservationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useRequireAuth()

  const query = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    refetchInterval: 30_000,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelReservation(params.id),
    onSuccess: () => {
      // Invalide la résa active → la home redirige naturellement vers
      // l'absence de banner. On rentre à l'accueil.
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
      router.replace('/')
    },
  })

  const extendMutation = useMutation({
    mutationFn: () => extendReservation(params.id),
    onSuccess: () => {
      // Refetch immédiat pour mettre à jour dueAt + extensionCount visibles
      // sur cet écran (le compteur "X/2" se rafraîchit).
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
    },
  })

  if (!user) return null

  const reservation = query.data
  const isCurrent = reservation?.id === params.id

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">Réservation active</p>
          <h1 className="font-display text-xl font-semibold">Scanner pour déverrouiller</h1>
        </div>
      </header>

      {query.isLoading && <p className="text-sm text-white/50">Chargement…</p>}
      {!query.isLoading && !isCurrent && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          Aucune réservation active ne correspond à cet ID. Elle a peut-être expiré ou été annulée.
        </p>
      )}
      {isCurrent && reservation && (
        <ReservationContent
          r={reservation}
          onCancel={() => cancelMutation.mutate()}
          cancelling={cancelMutation.isPending}
          cancelError={cancelMutation.error as Error | null}
          onExtend={() => extendMutation.mutate()}
          extending={extendMutation.isPending}
          extendError={extendMutation.error as Error | null}
        />
      )}
    </main>
  )
}

function ReservationContent({
  r,
  onCancel,
  cancelling,
  cancelError,
  onExtend,
  extending,
  extendError,
}: {
  r: ReservationActive
  onCancel: () => void
  cancelling: boolean
  cancelError: Error | null
  onExtend: () => void
  extending: boolean
  extendError: Error | null
}) {
  const [remaining, setRemaining] = useState(() => msUntil(r.expiresAt))
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntil(r.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [r.expiresAt])

  const expired = remaining <= 0
  const isScheduled = r.status === 'scheduled'
  const isDayPass = r.durationMinutes === 1440

  // Cancel logique : `pending` toujours possible, `scheduled` ssi
  // slotStartAt - now > 30 min. L'API renforce la même règle côté serveur
  // — ce check ici sert juste à griser le bouton dans l'UI.
  const minutesUntilSlot = r.slotStartAt
    ? (new Date(r.slotStartAt).getTime() - Date.now()) / 60_000
    : Infinity
  const canCancel =
    r.status === 'pending'
    || (isScheduled && minutesUntilSlot > CANCEL_CUTOFF_MIN)

  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6">
        <QRCodeSVG
          value={r.qrToken}
          size={256}
          level="H"
          marginSize={0}
          className={cn(expired && 'opacity-30')}
        />
        <p className="text-[11px] font-mono text-navy-900/50 text-center max-w-[256px] truncate">
          {r.qrToken.slice(0, 32)}…
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
        <Row icon={<MapPin className="h-4 w-4" />} label="Distributeur" value={r.distributor.name} />
        <Row icon={<Package className="h-4 w-4" />} label="Article" value={r.item.typeName} />
        {isScheduled && r.slotStartAt ? (
          // Pour les résas scheduled, le countdown vers expiresAt (slotEnd
          // + grâce 15min) peut être >24h → afficher "4777:49" est aberrant.
          // On affiche le créneau directement ; le countdown ne devient
          // utile qu'au moment où le slot démarre (status passe à pending).
          <Row
            icon={<CalendarClock className="h-4 w-4" />}
            label={isDayPass ? 'Date réservée' : 'Créneau'}
            value={fmtSlot(r.slotStartAt, r.slotEndAt ?? null, isDayPass)}
          />
        ) : (
          // pending : QR avec TTL court (15 min), countdown pertinent
          <Row
            icon={<Clock className="h-4 w-4" />}
            label="Temps restant"
            value={expired ? 'Expiré' : formatRemaining(remaining)}
            highlight={!expired}
          />
        )}
      </section>

      <p className="text-center text-[11px] leading-relaxed text-white/40">
        {isScheduled
          ? 'Présente ce QR au scanner du distributeur à l\'heure du créneau.'
          : 'Présente ce QR au scanner du distributeur. Le casier s\'ouvre automatiquement.'}
      </p>

      {/* Bloc prolongation — uniquement actif quand l'emprunt est réellement
          en cours (status 'active' = casier ouvert, item sorti). Pour les
          'pending' ou 'scheduled', l'API refuse 409 reservation_not_extendable. */}
      {r.status === 'active' && (
        <section className="rounded-xl border border-emerald-400/20 bg-white/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/85">Prolonger l'emprunt</p>
              <p className="text-[11px] text-white/45">
                {r.extensionCount} / {MAX_EXTENSIONS} prolongations utilisées
              </p>
            </div>
            <button
              type="button"
              onClick={onExtend}
              disabled={extending || r.extensionCount >= MAX_EXTENSIONS}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
                r.extensionCount >= MAX_EXTENSIONS
                  ? 'cursor-not-allowed bg-white/[0.02] text-white/30'
                  : 'bg-emerald-500 text-navy-900 hover:bg-emerald-400 disabled:opacity-50',
              )}
            >
              <Plus className="h-4 w-4" />
              {extending ? 'Prolongation…' : r.extensionCount >= MAX_EXTENSIONS ? 'Max atteint' : 'Prolonger'}
            </button>
          </div>
          {extendError && (
            <p className="text-[11px] text-rose-200">
              {extendError.message.includes('max_extensions_reached')
                ? `Tu as déjà utilisé tes ${MAX_EXTENSIONS} prolongations.`
                : extendError.message.includes('reservation_not_extendable')
                  ? 'Prolongation possible uniquement pendant l\'emprunt actif.'
                  : extendError.message.includes('locker_conflict')
                    ? 'Un autre créneau est réservé juste après — impossible de prolonger.'
                    : extendError.message}
            </p>
          )}
        </section>
      )}

      {/* Bloc annulation — gris si trop tard pour scheduled */}
      <section className="space-y-2">
        {confirmingCancel ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-3">
            <p className="text-sm text-rose-100">Annuler cette réservation ?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/55">
              {isScheduled
                ? 'Tu pourras en refaire une nouvelle ensuite tant que des créneaux sont libres.'
                : 'Le casier sera libéré immédiatement.'}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
                className="flex-1 rounded-lg border border-white/15 bg-white/5 py-2 text-sm font-medium hover:border-white/30"
              >
                Garder
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-rose-500 py-2 text-sm font-semibold text-navy-900 hover:bg-rose-400 disabled:opacity-50"
              >
                {cancelling ? 'Annulation…' : 'Confirmer'}
              </button>
            </div>
            {cancelError && (
              <p className="mt-2 text-[11px] text-rose-200">
                {cancelError.message.includes('too_late_to_cancel')
                  ? 'Trop tard : il reste moins de 30 min avant le début du créneau.'
                  : cancelError.message}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            disabled={!canCancel}
            title={!canCancel ? `Annulation possible jusqu'à ${CANCEL_CUTOFF_MIN} min avant le créneau` : undefined}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition',
              canCancel
                ? 'border-white/15 bg-white/5 text-white/80 hover:border-rose-400/40 hover:text-rose-200'
                : 'cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30',
            )}
          >
            <X className="h-4 w-4" />
            {canCancel
              ? 'Annuler la réservation'
              : `Annulation fermée (— ${CANCEL_CUTOFF_MIN} min avant le créneau)`}
          </button>
        )}
      </section>
    </>
  )
}

function Row({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-white/40">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
        <p className={cn('text-sm', highlight && 'font-mono font-semibold text-emerald-300')}>{value}</p>
      </div>
    </div>
  )
}

function msUntil(isoDate: string): number {
  return Math.max(0, new Date(isoDate).getTime() - Date.now())
}

function formatRemaining(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const min = Math.floor((totalSec % 3600) / 60)
  const sec = totalSec % 60
  if (hours > 0) return `${hours}h${String(min).padStart(2, '0')}`
  return `${min}:${String(sec).padStart(2, '0')}`
}

function fmtSlot(startIso: string, endIso: string | null, isDayPass: boolean): string {
  const start = new Date(startIso)
  const dateStr = start.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  if (isDayPass || !endIso) return dateStr
  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const endTime = new Date(endIso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${dateStr} · ${startTime} – ${endTime}`
}
