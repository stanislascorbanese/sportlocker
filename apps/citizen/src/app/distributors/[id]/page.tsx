'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, MessageSquare, Package } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import { Badge, type BadgeTone } from '../../../components/ui/Badge'
import { buttonClassName } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { ErrorState } from '../../../components/ui/ErrorState'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Skeleton } from '../../../components/ui/Skeleton'
import { StarRating } from '../../../components/ui/StarRating'
import {
  createReservation,
  fetchDistributorDetail,
  fetchDistributorReviews,
  type DistributorDetail,
  type DistributorReviews,
  type LockerItemType,
} from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'
import { useI18n, useT } from '../../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../../lib/i18n/messages'

/**
 * Détail d'un distributeur : statut, casiers idle, matériels groupés par
 * type, et grille des casiers physiques. L'utilisateur choisit un type, l'API
 * pick le casier disponible le plus ancien.
 */
export default function DistributorDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useRequireAuth()
  const t = useT()
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['distributor-detail', params.id],
    queryFn: () => fetchDistributorDetail(params.id),
    enabled: Boolean(user && params.id),
  })

  // Avis publics : moyenne + total sous le nom, et les 3 derniers commentaires.
  const reviewsQuery = useQuery({
    queryKey: ['distributor-reviews', params.id],
    queryFn: () => fetchDistributorReviews(params.id, { limit: 3 }),
    enabled: Boolean(user && params.id),
  })

  // Sélectionne un locker idle du type demandé (premier match par position).
  // Le backend exige lockerId + itemId + communeId pour le flow "borrow now",
  // contrairement au flow `scheduled` qui pick lui-même.
  const targetLocker = (() => {
    if (!detailQuery.data) return null
    const lockers = detailQuery.data.lockers
      .filter((l) => l.state === 'idle' && l.currentItemId != null)
    if (selectedTypeId) {
      return lockers.find((l) => l.itemType?.id === selectedTypeId) ?? null
    }
    return lockers[0] ?? null
  })()

  const reserveMutation = useMutation({
    mutationFn: () => {
      if (!detailQuery.data || !targetLocker || !targetLocker.currentItemId) {
        throw new Error('no_available_locker')
      }
      return createReservation({
        lockerId: targetLocker.id,
        itemId: targetLocker.currentItemId,
        communeId: detailQuery.data.communeId,
      })
    },
    onSuccess: async (reservation) => {
      // Invalidation cruciale : la home (et /reservations/<id>) utilisent
      // queryKey: ['reservation-active'] avec le résultat précédent. Sans
      // invalidation, la redirection affiche "Aucune réservation active ne
      // correspond" pendant 30s (refetchInterval) malgré le POST réussi.
      await queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
      router.push(`/reservations/${reservation.id}`)
    },
  })

  if (!user) return null

  const groups = detailQuery.data ? groupAvailableByType(detailQuery.data) : []
  const canReserve =
    detailQuery.data != null
    && !reserveMutation.isPending
    && detailQuery.data.idleLockers > 0
    && targetLocker != null
    && (groups.length === 0 || selectedTypeId != null)

  const borrowLabel = reserveMutation.isPending
    ? t('distributor.reserving')
    : detailQuery.data && detailQuery.data.idleLockers === 0
      ? t('distributor.no_locker')
      : groups.length > 0 && selectedTypeId == null
        ? t('distributor.borrow_now_pick')
        : t('distributor.borrow_now')

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader
        eyebrow={t('distributor.label')}
        title={detailQuery.data?.name ?? '…'}
        backHref="/"
        backLabel={t('nav.back')}
      />

      {reviewsQuery.data && reviewsQuery.data.count > 0 && (
        <RatingSummary reviews={reviewsQuery.data} />
      )}

      {detailQuery.isLoading && (
        <div className="space-y-3" aria-label={t('distributor.loading')}>
          <Skeleton height={72} rounded="card" />
          <Skeleton height={80} rounded="card" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton height={66} rounded="lg" />
            <Skeleton height={66} rounded="lg" />
          </div>
          <Skeleton height={48} rounded="lg" />
          <Skeleton height={48} rounded="lg" />
        </div>
      )}
      {detailQuery.error && (
        <ErrorState message={t('distributor.error', { message: (detailQuery.error as Error).message })} />
      )}

      {detailQuery.data && (
        <DetailContent
          d={detailQuery.data}
          groups={groups}
          selectedTypeId={selectedTypeId}
          onSelect={setSelectedTypeId}
        />
      )}

      {reviewsQuery.data && reviewsQuery.data.count > 0 && (
        <ReviewsSection reviews={reviewsQuery.data} />
      )}

      {detailQuery.data && (
        <>
          <Link
            href={`/distributors/${params.id}/book`}
            className={buttonClassName({ variant: 'primary', size: 'lg', fullWidth: true })}
          >
            {t('distributor.book_slot')}
          </Link>
          <button
            type="button"
            disabled={!canReserve}
            onClick={() => reserveMutation.mutate()}
            className={cn(
              buttonClassName({ variant: 'secondary', size: 'lg', fullWidth: true }),
              'disabled:opacity-40',
            )}
          >
            {borrowLabel}
          </button>
          {reserveMutation.error && (
            <ErrorState message={(reserveMutation.error as Error).message} />
          )}
        </>
      )}
    </main>
  )
}

type AvailableGroup = { itemType: LockerItemType; count: number }

/** Regroupe les casiers `idle` qui contiennent un item par type de matériel. */
function groupAvailableByType(d: DistributorDetail): AvailableGroup[] {
  const map = new Map<string, AvailableGroup>()
  for (const l of d.lockers) {
    if (l.state !== 'idle' || l.itemType == null) continue
    const existing = map.get(l.itemType.id)
    if (existing) existing.count += 1
    else map.set(l.itemType.id, { itemType: l.itemType, count: 1 })
  }
  return [...map.values()].sort((a, b) => a.itemType.name.localeCompare(b.itemType.name))
}

const STATUS_TONE: Record<DistributorDetail['status'], BadgeTone> = {
  online: 'success',
  offline: 'danger',
  maintenance: 'warning',
  decommissioned: 'neutral',
}

const STATUS_KEY: Record<DistributorDetail['status'], MessageKey> = {
  online: 'distributor.status.online',
  offline: 'distributor.status.offline',
  maintenance: 'distributor.status.maintenance',
  decommissioned: 'distributor.status.decommissioned',
}

const LOCKER_STATE_KEY: Record<DistributorDetail['lockers'][number]['state'], MessageKey> = {
  idle: 'distributor.locker.idle',
  reserved: 'distributor.locker.reserved',
  active: 'distributor.locker.active',
  returning: 'distributor.locker.returning',
  fault: 'distributor.locker.fault',
}

function DetailContent({
  d,
  groups,
  selectedTypeId,
  onSelect,
}: {
  d: DistributorDetail
  groups: AvailableGroup[]
  selectedTypeId: string | null
  onSelect: (id: string) => void
}) {
  const t = useT()
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
              {t('distributor.address')}
            </p>
            <p className="text-sm">{d.addressLine ?? '—'}</p>
          </div>
          <Badge tone={STATUS_TONE[d.status]} size="sm">
            {t(STATUS_KEY[d.status])}
          </Badge>
        </div>
      </Card>

      <Card variant="accent">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold text-navy-900 dark:text-white">
              {d.idleLockers}
              <span className="text-sm font-normal text-gray-400 dark:text-white/40">
                /{d.lockerCount}
              </span>
            </p>
            <p className="text-eyebrow uppercase text-emerald-700 dark:text-emerald-300/80">
              {t('distributor.lockers_free')}
            </p>
          </div>
        </div>
      </Card>

      {groups.length > 0 && (
        <section>
          <h2 className="mb-2 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
            {t('distributor.available_items')}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {groups.map((g) => {
              const isSelected = selectedTypeId === g.itemType.id
              return (
                <li key={g.itemType.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(g.itemType.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors duration-base ease-out-soft',
                      isSelected
                        ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                        : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/30',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {g.itemType.imageUrl ? (
                      <img
                        src={g.itemType.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-white/10">
                        <Package
                          className="h-5 w-5 text-gray-500 dark:text-white/60"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.itemType.name}</p>
                      <p className="text-meta text-gray-500 dark:text-white/50">
                        {g.count === 1
                          ? t('distributor.available_count_one')
                          : t('distributor.available_count_many', { count: g.count })}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {d.lockers.length > 0 && (
        <section>
          <h2 className="mb-2 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
            {t('distributor.lockers_count', { count: d.lockers.length })}
          </h2>
          <ul className="grid grid-cols-4 gap-2">
            {d.lockers.map((l) => (
              <li
                key={l.id}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-2 text-center',
                  l.state === 'idle'
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/5'
                    : 'border-gray-200 bg-gray-50 opacity-70 dark:border-white/10 dark:bg-white/5',
                )}
                title={l.itemType?.name ?? '—'}
              >
                <span className="text-[10px] text-gray-400 dark:text-white/40">
                  #{l.position + 1}
                </span>
                <span className="truncate text-[11px] font-medium">{l.itemType?.name ?? '—'}</span>
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-wider',
                    l.state === 'idle'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-gray-400 dark:text-white/40',
                  )}
                >
                  {t(LOCKER_STATE_KEY[l.state])}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/**
 * Résumé de notation affiché sous le nom : étoiles moyennes + nombre d'avis.
 * Rendu uniquement quand `count > 0` (cf. appelant).
 */
function RatingSummary({ reviews }: { reviews: DistributorReviews }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2">
      <StarRating value={reviews.average ?? 0} size="sm" />
      <span className="text-sm font-semibold text-navy-900 dark:text-white">
        {(reviews.average ?? 0).toFixed(1)}
      </span>
      <span className="text-meta text-gray-500 dark:text-white/50">
        {reviews.count === 1
          ? t('reviews.count_one')
          : t('reviews.count_many', { count: reviews.count })}
      </span>
    </div>
  )
}

/**
 * Section repliable listant les 3 derniers commentaires. Les avis sans
 * commentaire (note seule) sont filtrés — rien à lire. Si aucun commentaire
 * textuel, la section ne s'affiche pas.
 */
function ReviewsSection({ reviews }: { reviews: DistributorReviews }) {
  const t = useT()
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)

  const withComment = reviews.items.filter((r) => r.comment && r.comment.trim().length > 0)
  if (withComment.length === 0) return null

  const fmtDate = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-card border px-4 py-3 text-left transition-colors duration-base ease-out-soft border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/25"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500 dark:text-white/60" aria-hidden="true" />
          <span className="text-sm font-medium text-navy-900 dark:text-white/85">
            {t('reviews.section_title')}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400 dark:text-white/40" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400 dark:text-white/40" aria-hidden="true" />
        )}
      </button>

      {open && (
        <ul className="mt-2 space-y-2">
          {withComment.map((r, i) => (
            <li
              key={i}
              className="rounded-card border p-3 border-gray-200 bg-white dark:border-white/10 dark:bg-white/5"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <StarRating value={r.rating} size="sm" />
                <span className="text-[11px] text-gray-400 dark:text-white/40">
                  {fmtDate.format(new Date(r.createdAt))}
                </span>
              </div>
              <p className="text-sm text-navy-900 dark:text-white/85">{r.comment}</p>
              <p className="mt-1 text-meta text-gray-500 dark:text-white/50">
                {r.authorName ?? t('reviews.anonymous')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
