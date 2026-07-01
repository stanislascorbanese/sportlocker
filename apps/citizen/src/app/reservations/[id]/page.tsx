'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock, MapPin, Package, Plus, WifiOff, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'

import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { PageHeader } from '../../../components/ui/PageHeader'
import { PaymentStep } from '../../../components/PaymentStep'
import { Skeleton } from '../../../components/ui/Skeleton'
import {
  MAX_EXTENSIONS,
  cancelReservation,
  extendReservation,
  fetchActiveReservation,
  type ReservationActive,
} from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'
import { useI18n, useT } from '../../../lib/i18n/I18nProvider'

/**
 * Affiche la réservation active avec son QR code à scanner sur la borne.
 *
 * Le QR contient un JWT HS256 signé par l'API (cf. CLAUDE.md : valable
 * 15 min, nonce anti-replay). Rendu en SVG (qualité au zoom).
 *
 * Refresh auto chaque 30s pour le timer et le passage de statut
 * (scheduled → pending → active dès que l'utilisateur scanne).
 *
 * Annulation : `pending` toujours possible, `scheduled` ssi > 30 min avant
 * `slotStartAt`. L'API renforce la règle côté serveur.
 */
const CANCEL_CUTOFF_MIN = 30

export default function ReservationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useRequireAuth()
  const t = useT()

  const query = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    // Polling rapide tant que le paiement n'est pas réglé : après confirmation
    // Stripe, le passage `pending_payment → scheduled` (webhook) arrive vite.
    refetchInterval: (q) =>
      q.state.data?.status === 'pending_payment' ? 3_000 : 30_000,
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelReservation(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
      router.replace('/')
    },
  })

  const extendMutation = useMutation({
    mutationFn: () => extendReservation(params.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
    },
  })

  if (!user) return null

  const reservation = query.data
  const isCurrent = reservation?.id === params.id

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader
        eyebrow={t('reservation.page.eyebrow')}
        title={t('reservation.page.title')}
        backHref="/"
        backLabel={t('nav.back')}
      />

      {query.isLoading && (
        <div className="space-y-5" aria-label={t('reservation.page.loading')}>
          <Skeleton height={300} rounded="card" />
          <Skeleton height={140} rounded="card" />
        </div>
      )}
      {!query.isLoading && !isCurrent && (
        <p className="rounded-card border p-3 text-sm border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
          {t('reservation.page.not_found')}
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
  const t = useT()
  const { locale } = useI18n()
  const [remaining, setRemaining] = useState(() => msUntil(r.expiresAt))
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntil(r.expiresAt)), 1000)
    return () => clearInterval(id)
  }, [r.expiresAt])

  const expired = remaining <= 0
  const isScheduled = r.status === 'scheduled'
  const isDayPass = r.durationMinutes === 1440
  // Tone du countdown — escalade visuelle quand on approche de l'expiration.
  const countdownTone: 'urgent' | 'warning' | 'normal' =
    !expired && remaining > 0 && remaining < 30_000
      ? 'urgent'
      : !expired && remaining < 120_000
        ? 'warning'
        : 'normal'

  const minutesUntilSlot = r.slotStartAt
    ? (new Date(r.slotStartAt).getTime() - Date.now()) / 60_000
    : Infinity
  const isPendingPayment = r.status === 'pending_payment'
  const canCancel =
    isPendingPayment
    || r.status === 'pending'
    || (isScheduled && minutesUntilSlot > CANCEL_CUTOFF_MIN)

  return (
    <>
      {isPendingPayment ? (
        <PaymentStep reservation={r} />
      ) : (
        <section className="flex animate-scale-in flex-col items-center gap-3 rounded-card bg-white p-6 shadow-card dark:bg-white">
          {r.offline && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-navy-900/5 px-3 py-1 text-meta font-medium text-navy-900/70"
              role="status"
            >
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
              {t('reservation.page.offline_badge')}
            </span>
          )}
          <QRCodeSVG
            value={r.qrToken ?? ''}
            size={256}
            level="H"
            marginSize={0}
            className={cn(expired && 'opacity-30')}
          />
          <p className="max-w-[256px] truncate text-center font-mono text-meta text-navy-900/50">
            {(r.qrToken ?? '').slice(0, 32)}…
          </p>
          {r.offline && (
            <p className="max-w-[256px] text-center text-meta text-navy-900/50">
              {t('reservation.page.offline_hint')}
            </p>
          )}
        </section>
      )}

      {!isPendingPayment && (
      <Card>
        <div className="space-y-3">
          <Row
            icon={<MapPin className="h-4 w-4" />}
            label={t('reservation.page.distributor')}
            value={r.distributor.name}
          />
          <Row
            icon={<Package className="h-4 w-4" />}
            label={t('reservation.page.item')}
            value={r.item.typeName}
          />
          {isScheduled && r.slotStartAt ? (
            <Row
              icon={<CalendarClock className="h-4 w-4" />}
              label={
                isDayPass ? t('reservation.page.scheduled_date') : t('reservation.page.slot')
              }
              value={fmtSlot(r.slotStartAt, r.slotEndAt ?? null, isDayPass, locale)}
            />
          ) : (
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5',
                  countdownTone === 'urgent'
                    ? 'text-rose-600 dark:text-rose-400'
                    : countdownTone === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-gray-400 dark:text-white/40',
                )}
              >
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
                  {t('reservation.page.remaining')}
                </p>
                <p
                  className={cn(
                    'text-sm font-mono font-semibold tabular-nums',
                    countdownTone === 'urgent'
                      ? 'animate-pulse text-rose-700 dark:text-rose-300'
                      : countdownTone === 'warning'
                        ? 'animate-pulse text-amber-700 dark:text-amber-300'
                        : expired
                          ? 'text-gray-500 dark:text-white/40'
                          : 'text-emerald-700 dark:text-emerald-300',
                  )}
                >
                  {expired ? t('reservation.page.expired') : formatRemaining(remaining)}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
      )}

      {!isPendingPayment && (
        <p className="text-center text-meta leading-relaxed text-gray-500 dark:text-white/40">
          {isScheduled ? t('reservation.page.help.scheduled') : t('reservation.page.help.pending')}
        </p>
      )}

      {/* Bloc prolongation — uniquement actif quand l'emprunt est réellement
          en cours (status 'active' = casier ouvert, item sorti). Pour les
          'pending' ou 'scheduled', l'API refuse 409 reservation_not_extendable. */}
      {r.status === 'active' && (
        <Card variant="accent" className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-navy-900 dark:text-white/85">
                {t('reservation.page.extend_title')}
              </p>
              <p className="text-meta text-gray-500 dark:text-white/45">
                {t('reservation.page.extend_count', {
                  used: r.extensionCount,
                  max: MAX_EXTENSIONS,
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onExtend}
              disabled={extending || r.extensionCount >= MAX_EXTENSIONS}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-base',
                r.extensionCount >= MAX_EXTENSIONS
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-white/[0.02] dark:text-white/30'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400',
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {extending
                ? t('reservation.page.extending')
                : r.extensionCount >= MAX_EXTENSIONS
                  ? t('reservation.page.extend_max')
                  : t('reservation.page.extend_btn')}
            </button>
          </div>
          {extendError && (
            <p className="text-meta text-rose-700 dark:text-rose-200">
              {extendError.message.includes('max_extensions_reached')
                ? t('reservation.page.extend.max_reached', { max: MAX_EXTENSIONS })
                : extendError.message.includes('reservation_not_extendable')
                  ? t('reservation.page.extend.not_extendable')
                  : extendError.message.includes('locker_conflict')
                    ? t('reservation.page.extend.locker_conflict')
                    : extendError.message}
            </p>
          )}
        </Card>
      )}

      {/* Bloc annulation */}
      <section className="space-y-2">
        {confirmingCancel ? (
          <div className="rounded-card border p-3 border-rose-300 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-500/5">
            <p className="text-sm text-rose-800 dark:text-rose-100">
              {t('reservation.page.cancel.confirm_title')}
            </p>
            <p className="mt-1 text-meta leading-relaxed text-gray-600 dark:text-white/55">
              {isScheduled
                ? t('reservation.page.cancel.confirm_help.scheduled')
                : t('reservation.page.cancel.confirm_help.pending')}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingCancel(false)}
                disabled={cancelling}
                className="flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-base border-gray-200 bg-white hover:border-gray-300 dark:border-white/15 dark:bg-white/5 dark:hover:border-white/30"
              >
                {t('reservation.page.cancel.keep')}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition-colors duration-base hover:bg-rose-500 disabled:opacity-50 dark:bg-rose-500 dark:text-navy-900 dark:hover:bg-rose-400"
              >
                {cancelling ? t('reservation.page.cancel.cancelling') : t('reservation.page.cancel.confirm')}
              </button>
            </div>
            {cancelError && (
              <p className="mt-2 text-meta text-rose-700 dark:text-rose-200">
                {cancelError.message.includes('too_late_to_cancel')
                  ? t('reservation.page.cancel.too_late')
                  : cancelError.message}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            disabled={!canCancel}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors duration-base',
              canCancel
                ? 'border-gray-200 bg-white text-gray-700 hover:border-rose-300 hover:text-rose-700 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:border-rose-400/40 dark:hover:text-rose-200'
                : 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400 dark:border-white/5 dark:bg-white/[0.02] dark:text-white/30',
            )}
          >
            <X className="h-4 w-4" />
            {canCancel
              ? t('reservation.page.cancel_btn')
              : t('reservation.page.cancel_closed', { minutes: CANCEL_CUTOFF_MIN })}
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
      <span className="mt-0.5 text-gray-400 dark:text-white/40">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-eyebrow uppercase text-gray-500 dark:text-white/50">{label}</p>
        <p
          className={cn(
            'text-sm',
            highlight && 'font-mono font-semibold text-emerald-700 dark:text-emerald-300',
          )}
        >
          {value}
        </p>
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

function fmtSlot(
  startIso: string,
  endIso: string | null,
  isDayPass: boolean,
  locale: 'fr' | 'en',
): string {
  const intlLocale = locale === 'fr' ? 'fr-FR' : 'en-GB'
  const start = new Date(startIso)
  const dateStr = start.toLocaleDateString(intlLocale, {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  if (isDayPass || !endIso) return dateStr
  const startTime = start.toLocaleTimeString(intlLocale, { hour: '2-digit', minute: '2-digit' })
  const endTime = new Date(endIso).toLocaleTimeString(intlLocale, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${dateStr} · ${startTime} – ${endTime}`
}
