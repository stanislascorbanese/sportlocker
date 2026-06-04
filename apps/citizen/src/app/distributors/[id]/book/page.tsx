'use client'

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Card } from '../../../../components/ui/Card'
import { ErrorState } from '../../../../components/ui/ErrorState'
import { PageHeader } from '../../../../components/ui/PageHeader'
import { Skeleton } from '../../../../components/ui/Skeleton'
import {
  DAY_PASS_MINUTES,
  SLOT_DURATIONS,
  type SlotDurationMinutes,
  createSlotReservation,
  fetchAvailability,
  fetchDistributorDetail,
  isDayPassDuration,
  type AvailabilitySlot,
  type DistributorDetail,
  type LockerItemType,
} from '../../../../lib/api'
import { useRequireAuth } from '../../../../lib/auth-context'
import { cn } from '../../../../lib/cn'
import { useI18n, useT } from '../../../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../../../lib/i18n/messages'

/**
 * Flow de réservation par créneaux (modèle slots PR 0008).
 *
 *   1. Choix du sport (item_type) — chips horizontaux
 *   2. Choix de la durée — 30/60/90/120 min + journée
 *   3. Grille des créneaux disponibles J→J+7
 *   4. Récap (prix figé) + bouton "Réserver"
 *
 * Le calendrier ne s'affiche qu'après les 2 premiers choix (cascade). Si pas
 * de pricing_rule pour le triplet courant, l'API renvoie une grille avec
 * `priceCents=null` → on affiche "Pas de tarif configuré".
 */

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string

function fmtDurationMinutes(d: SlotDurationMinutes, t: TFn): string {
  if (d === DAY_PASS_MINUTES) return t('booking.day_pass_label')
  if (d < 60) return t('booking.duration_min', { count: d })
  const h = Math.floor(d / 60)
  const r = d % 60
  return r === 0
    ? t('booking.duration_hour', { count: h })
    : t('booking.duration_hour_min', { hours: h, minutes: r })
}

function fmtPrice(cents: number | null, locale: 'fr' | 'en', tFree: string): string {
  if (cents === null) return '—'
  if (cents === 0) return tFree
  return `${(cents / 100).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    maximumFractionDigits: 2,
  })} €`
}

function fmtHour(iso: string, locale: 'fr' | 'en'): string {
  return new Date(iso).toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDayShort(
  isoDay: string,
  locale: 'fr' | 'en',
): { weekday: string; day: number; month: string } {
  const intlLocale = locale === 'fr' ? 'fr-FR' : 'en-GB'
  const d = new Date(`${isoDay}T12:00:00Z`)
  return {
    weekday: d.toLocaleDateString(intlLocale, { weekday: 'short' }),
    day: d.getUTCDate(),
    month: d.toLocaleDateString(intlLocale, { month: 'short' }),
  }
}

function fmtFullSlot(
  slot: AvailabilitySlot,
  duration: SlotDurationMinutes,
  locale: 'fr' | 'en',
  tDayPass: string,
): string {
  const intlLocale = locale === 'fr' ? 'fr-FR' : 'en-GB'
  const d = new Date(slot.startsAt)
  const dateStr = d.toLocaleDateString(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  if (duration === DAY_PASS_MINUTES) return `${dateStr} · ${tDayPass}`
  return `${dateStr} · ${fmtHour(slot.startsAt, locale)} – ${fmtHour(slot.endsAt, locale)}`
}

function groupAvailableTypes(d: DistributorDetail): LockerItemType[] {
  const map = new Map<string, LockerItemType>()
  for (const l of d.lockers) {
    if (l.itemType && !map.has(l.itemType.id)) map.set(l.itemType.id, l.itemType)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export default function BookingPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useRequireAuth()
  const t = useT()
  const { locale } = useI18n()

  const [itemTypeId, setItemTypeId] = useState<string | null>(null)
  const [duration, setDuration] = useState<SlotDurationMinutes>(60)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)

  const detailQuery = useQuery({
    queryKey: ['distributor-detail', params.id],
    queryFn: () => fetchDistributorDetail(params.id),
    enabled: Boolean(user && params.id),
  })

  const availabilityQuery = useQuery({
    queryKey: ['availability', params.id, itemTypeId, duration],
    queryFn: () => fetchAvailability({
      distributorId: params.id,
      itemTypeId: itemTypeId!,
      durationMinutes: duration,
    }),
    enabled: Boolean(user && params.id && itemTypeId),
    staleTime: 30_000,
  })

  // Fetch prix pour les 5 durées en parallèle (queryKey identique = dédupé).
  const priceQueries = useQueries({
    queries: SLOT_DURATIONS.map((d) => ({
      queryKey: ['availability', params.id, itemTypeId, d],
      queryFn: () => fetchAvailability({
        distributorId: params.id,
        itemTypeId: itemTypeId!,
        durationMinutes: d,
      }),
      enabled: Boolean(user && params.id && itemTypeId),
      staleTime: 60_000,
    })),
  })

  const pricesByDuration = useMemo<Record<number, number | null>>(() => {
    const out: Record<number, number | null> = {}
    SLOT_DURATIONS.forEach((d, i) => {
      const data = priceQueries[i]?.data
      if (!data) {
        out[d] = null
        return
      }
      let found: number | null = null
      for (const dayKey of Object.keys(data.days)) {
        for (const slot of data.days[dayKey] ?? []) {
          if (slot.priceCents !== null) {
            found = slot.priceCents
            break
          }
        }
        if (found !== null) break
      }
      out[d] = found
    })
    return out
  }, [priceQueries])

  const reserveMutation = useMutation({
    mutationFn: () => createSlotReservation({
      distributorId: params.id,
      itemTypeId: itemTypeId!,
      slotStartAt: selectedSlot!.startsAt,
      durationMinutes: duration,
    }),
    onSuccess: (created) => {
      // Résa créée en `pending_payment` (slot tenu, pas encore de QR). On
      // redirige vers le détail qui prend en charge l'étape de paiement.
      queryClient.invalidateQueries({ queryKey: ['reservation-active'] })
      router.push(`/reservations/${created.id}`)
    },
  })

  const types = useMemo(
    () => (detailQuery.data ? groupAvailableTypes(detailQuery.data) : []),
    [detailQuery.data],
  )
  const days = availabilityQuery.data?.days ?? {}
  const dayKeys = Object.keys(days).sort()

  if (!user) return null

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader
        eyebrow={t('booking.title')}
        title={detailQuery.data?.name ?? '…'}
        backHref={`/distributors/${params.id}`}
        backLabel={t('nav.back')}
      />

      {/* Étape 1 : sport */}
      <section>
        <h2 className="mb-2 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
          {t('booking.step1')}
        </h2>
        {types.length === 0 ? (
          <p className="rounded-card border p-3 text-sm border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
            {t('distributor.no_items')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {types.map((type) => {
              const isSel = itemTypeId === type.id
              return (
                <li key={type.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setItemTypeId(type.id)
                      setSelectedSlot(null)
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors duration-base ease-out-soft',
                      isSel
                        ? 'border-emerald-400 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-100'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-white/15 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/40',
                    )}
                  >
                    {type.name}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Étape 2 : durée */}
      {itemTypeId && (
        <section>
          <h2 className="mb-2 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
            {t('booking.step2')}
          </h2>
          <ul className="space-y-1.5">
            {SLOT_DURATIONS.map((d) => {
              const isSel = duration === d
              const price = pricesByDuration[d]
              const isDay = isDayPassDuration(d)
              const priceLoading = priceQueries[SLOT_DURATIONS.indexOf(d)]?.isPending ?? true
              const unavailable = !priceLoading && price == null
              return (
                <li key={d}>
                  <button
                    type="button"
                    disabled={unavailable}
                    onClick={() => {
                      setDuration(d)
                      setSelectedSlot(null)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-base ease-out-soft',
                      unavailable
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400 dark:border-white/5 dark:bg-white/[0.02] dark:text-white/30'
                        : isSel
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/30',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full',
                        isSel
                          ? 'bg-emerald-200 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200'
                          : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60',
                      )}>
                        <Clock className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-sm font-medium tabular-nums">
                          {fmtDurationMinutes(d, t)}
                        </p>
                        {isDay && (
                          <p className="text-[10px] text-gray-500 dark:text-white/45">
                            {t('booking.day_pass_long')}
                          </p>
                        )}
                      </div>
                    </div>
                    {priceLoading ? (
                      <span className="text-xs tabular-nums text-gray-400 dark:text-white/30">
                        …
                      </span>
                    ) : (
                      <span
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          unavailable
                            ? 'text-gray-400 dark:text-white/30'
                            : 'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {price == null ? '—' : fmtPrice(price, locale, t('booking.free'))}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Étape 3 : créneau */}
      {itemTypeId && (
        <section>
          <h2 className="mb-2 text-eyebrow font-medium uppercase text-gray-500 dark:text-white/55">
            {t('booking.step3')}
          </h2>
          {availabilityQuery.isLoading && (
            <div className="space-y-3" aria-label={t('booking.loading_slots')}>
              <div className="flex gap-2 overflow-hidden">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} width={60} height={64} rounded="lg" />
                ))}
              </div>
              <Skeleton height={220} rounded="lg" className="mx-auto max-w-xs" />
            </div>
          )}
          {availabilityQuery.error && (
            <ErrorState message={(availabilityQuery.error as Error).message} />
          )}
          {availabilityQuery.data && dayKeys.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-white/50">
              {t('booking.empty_slots')}
            </p>
          )}
          {availabilityQuery.data && dayKeys.length > 0 && (() => {
            const allWithoutPrice = dayKeys.every((dk) =>
              (days[dk] ?? []).every((s) => s.priceCents === null),
            )
            return (
              <>
                {allWithoutPrice && (
                  <p className="mb-3 rounded-card border p-3 text-[12px] leading-relaxed border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200">
                    {t('booking.no_pricing', { duration: fmtDurationMinutes(duration, t) })}
                  </p>
                )}
                {isDayPassDuration(duration) ? (
                  <DayPassGrid
                    days={days}
                    dayKeys={dayKeys}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                    locale={locale}
                  />
                ) : (
                  <SlotGrid
                    days={days}
                    dayKeys={dayKeys}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                    locale={locale}
                  />
                )}
              </>
            )
          })()}
        </section>
      )}

      {/* Étape 4 : récap + confirmation */}
      {selectedSlot && (
        <Card variant="accent">
          <div className="flex items-start gap-3">
            <CalendarClock
              className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium capitalize text-navy-900 dark:text-white">
                {fmtFullSlot(selectedSlot, duration, locale, t('booking.day_pass_label'))}
              </p>
              <p className="mt-1 text-meta text-gray-600 dark:text-white/60">
                {fmtDurationMinutes(duration, t)} · {fmtPrice(selectedSlot.priceCents, locale, t('booking.free'))}
              </p>
              <p className="mt-2 text-meta leading-relaxed text-gray-500 dark:text-white/40">
                {isDayPassDuration(duration)
                  ? t('booking.notice.day_pass')
                  : t('booking.notice.slot')}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={reserveMutation.isPending}
            onClick={() => reserveMutation.mutate()}
            className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors duration-base bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
          >
            {reserveMutation.isPending ? t('distributor.reserving') : t('booking.confirm_btn')}
          </button>
          {reserveMutation.error && (
            <p className="mt-2 rounded-card border p-2 text-meta border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
              {(reserveMutation.error as Error).message}
            </p>
          )}
        </Card>
      )}
    </main>
  )
}

function SlotGrid({
  days,
  dayKeys,
  selected,
  onSelect,
  locale,
}: {
  days: Record<string, AvailabilitySlot[]>
  dayKeys: string[]
  selected: AvailabilitySlot | null
  onSelect: (s: AvailabilitySlot) => void
  locale: 'fr' | 'en'
}) {
  const t = useT()
  const firstDayWithSlots = dayKeys.find((dk) =>
    (days[dk] ?? []).some((s) => s.available && s.priceCents !== null),
  ) ?? dayKeys[0] ?? null

  const [activeDay, setActiveDay] = useState<string | null>(firstDayWithSlots)
  useEffect(() => {
    setActiveDay(firstDayWithSlots)
  }, [firstDayWithSlots])

  useEffect(() => {
    if (selected) {
      const sel = new Date(selected.startsAt)
      const key = `${sel.getFullYear()}-${String(sel.getMonth() + 1).padStart(2, '0')}-${String(sel.getDate()).padStart(2, '0')}`
      if (dayKeys.includes(key)) setActiveDay(key)
    }
  }, [selected, dayKeys])

  const currentSlots = activeDay ? (days[activeDay] ?? []) : []
  const hasAvailableInActiveDay = currentSlots.some((s) => s.available && s.priceCents !== null)

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {dayKeys.map((dk) => {
          const d = fmtDayShort(dk, locale)
          const slots = days[dk] ?? []
          const hasFree = slots.some((s) => s.available && s.priceCents !== null)
          const isActive = activeDay === dk
          return (
            <button
              key={dk}
              type="button"
              onClick={() => setActiveDay(dk)}
              className={cn(
                'flex shrink-0 flex-col items-center gap-0 rounded-xl border px-3.5 py-2 transition-colors duration-base',
                isActive
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10'
                  : hasFree
                    ? 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/30'
                    : 'border-gray-100 bg-gray-50 text-gray-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-white/35',
              )}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-70">{d.weekday}</span>
              <span className="text-lg font-semibold tabular-nums leading-tight">{d.day}</span>
              <span className="text-[10px] opacity-55">{d.month}</span>
            </button>
          )
        })}
      </div>

      {!hasAvailableInActiveDay ? (
        <p className="rounded-lg border p-3 text-center text-meta border-gray-200 bg-gray-50 text-gray-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-white/45">
          {t('booking.no_slot_day')}
        </p>
      ) : (
        <TimeWheel slots={currentSlots} selected={selected} onSelect={onSelect} locale={locale} />
      )}
    </div>
  )
}

function TimeWheel({
  slots,
  selected,
  onSelect,
  locale,
}: {
  slots: AvailabilitySlot[]
  selected: AvailabilitySlot | null
  onSelect: (s: AvailabilitySlot) => void
  locale: 'fr' | 'en'
}) {
  const ITEM_HEIGHT = 44
  const VISIBLE = 5
  const HEIGHT = ITEM_HEIGHT * VISIBLE
  const PAD = (HEIGHT - ITEM_HEIGHT) / 2

  const available = useMemo(
    () => slots.filter((s) => s.available && s.priceCents !== null),
    [slots],
  )
  const containerRef = useRef<HTMLDivElement | null>(null)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (!containerRef.current || !selected) return
    const idx = available.findIndex((s) => s.startsAt === selected.startsAt)
    if (idx >= 0) {
      containerRef.current.scrollTop = idx * ITEM_HEIGHT
    }
  }, [selected, available])

  useEffect(() => {
    if (!selected && available.length > 0 && available[0]) {
      onSelect(available[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.length])

  const handleScroll = () => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
    }
    debounceRef.current = window.setTimeout(() => {
      if (!containerRef.current) return
      const idx = Math.round(containerRef.current.scrollTop / ITEM_HEIGHT)
      const slot = available[Math.max(0, Math.min(idx, available.length - 1))]
      if (slot && slot.startsAt !== selected?.startsAt) {
        onSelect(slot)
      }
    }, 120)
  }

  return (
    <div className="relative mx-auto w-full max-w-xs select-none" style={{ height: HEIGHT }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-xl border border-emerald-400/60 bg-emerald-50 dark:bg-emerald-500/10"
        style={{ top: PAD, height: ITEM_HEIGHT }}
      />

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          paddingTop: PAD,
          paddingBottom: PAD,
          scrollSnapType: 'y mandatory',
        }}
      >
        {available.map((s, i) => {
          const isSel = selected?.startsAt === s.startsAt
          return (
            <button
              key={s.startsAt}
              type="button"
              onClick={() => {
                containerRef.current?.scrollTo({
                  top: i * ITEM_HEIGHT,
                  behavior: 'smooth',
                })
                onSelect(s)
              }}
              style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
              className={cn(
                'flex w-full items-center justify-center text-lg tabular-nums transition-colors',
                isSel
                  ? 'font-semibold text-emerald-800 dark:text-emerald-100'
                  : 'text-gray-500 dark:text-white/45',
              )}
            >
              {fmtHour(s.startsAt, locale)}
            </button>
          )
        })}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-white via-white/85 to-transparent dark:from-navy-900 dark:via-navy-900/85"
        style={{ height: PAD - 6 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/85 to-transparent dark:from-navy-900 dark:via-navy-900/85"
        style={{ height: PAD - 6 }}
      />
    </div>
  )
}

function DayPassGrid({
  days,
  dayKeys,
  selected,
  onSelect,
  locale,
}: {
  days: Record<string, AvailabilitySlot[]>
  dayKeys: string[]
  selected: AvailabilitySlot | null
  onSelect: (s: AvailabilitySlot) => void
  locale: 'fr' | 'en'
}) {
  const t = useT()
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {dayKeys.map((dk) => {
        const d = fmtDayShort(dk, locale)
        const slot = days[dk]?.[0]
        if (!slot) return null
        const isSel = selected?.startsAt === slot.startsAt
        const noPrice = slot.priceCents === null
        return (
          <li key={dk}>
            <button
              type="button"
              disabled={!slot.available || noPrice}
              onClick={() => onSelect(slot)}
              title={noPrice ? t('booking.no_day_pass_tooltip') : undefined}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors duration-base',
                !slot.available || noPrice
                  ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400 dark:border-white/5 dark:bg-white/[0.02] dark:text-white/30'
                  : isSel
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-100'
                    : 'border-gray-200 bg-white text-navy-900 hover:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:text-white/85 dark:hover:border-emerald-400/40',
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/50">
                  {d.weekday}
                </span>
                <span className="text-base font-semibold tabular-nums">{d.day}</span>
                <span className="text-[10px] text-gray-400 dark:text-white/40">{d.month}</span>
              </div>
              <span className="text-sm tabular-nums">
                {fmtPrice(slot.priceCents, locale, t('booking.free'))}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
