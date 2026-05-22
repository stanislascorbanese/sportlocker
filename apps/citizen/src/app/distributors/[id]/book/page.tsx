'use client'

import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarClock, Check, Clock } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { useMemo, useState } from 'react'

import {
  DAY_PASS_MINUTES,
  SLOT_DURATIONS,
  type SlotDurationMinutes,
  type SlotReservationCreated,
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

/**
 * Flow de réservation par créneaux (modèle slots PR 0008).
 *
 *   1. Choix du sport (item_type) — chips horizontaux
 *   2. Choix de la durée — 30/60/90/120 min
 *   3. Grille des créneaux disponibles J→J+7 — colonnes = jours, cellules = slots
 *   4. Récap (prix figé) + bouton "Réserver ce créneau"
 *
 * Le calendrier ne s'affiche qu'après les 2 premiers choix (cascade
 * dépendante). Si pas de pricing_rule pour le triplet courant, l'API
 * renvoie une grille avec `priceCents=null` et `available=false` → on
 * affiche "Pas de tarif configuré".
 */

function fmtDurationMinutes(d: SlotDurationMinutes): string {
  if (d === DAY_PASS_MINUTES) return 'Journée'
  if (d < 60) return `${d} min`
  const h = Math.floor(d / 60)
  const r = d % 60
  return r === 0 ? `${h} h` : `${h} h ${r}`
}

function fmtPrice(cents: number | null): string {
  if (cents === null) return '—'
  if (cents === 0) return 'Gratuit'
  return `${(cents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`
}

function fmtHour(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDayShort(isoDay: string): { weekday: string; day: number; month: string } {
  const d = new Date(`${isoDay}T12:00:00Z`)
  return {
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
    day: d.getUTCDate(),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }),
  }
}

function fmtFullSlot(slot: AvailabilitySlot, duration: SlotDurationMinutes): string {
  const d = new Date(slot.startsAt)
  const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  // Forfait journée : on n'affiche pas la fourchette horaire (peu utile,
  // car le citoyen vient quand il veut dans les heures d'ouverture).
  if (duration === DAY_PASS_MINUTES) return `${dateStr} · Forfait journée`
  return `${dateStr} · ${fmtHour(slot.startsAt)} – ${fmtHour(slot.endsAt)}`
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
  const user = useRequireAuth()

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
    // Pas de fetch tant que pas d'itemType choisi : économise une requête
    // qui renverrait 422 de toute façon (itemTypeId obligatoire).
    enabled: Boolean(user && params.id && itemTypeId),
    staleTime: 30_000,
  })

  // Pour afficher le prix sous chaque bouton de durée, on fetch availability
  // en parallèle pour les 5 durées. React-query dédupe la requête en cours
  // (celle de la durée sélectionnée) automatiquement via queryKey identique.
  // Le prix est extrait du premier slot avec priceCents non-null — la grille
  // pricing_rules garantit un prix unique par triplet (commune × item × duration).
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
      // Premier slot avec un prix dans les 7 jours — null si toute la grille
      // est à priceCents=null (= pricing_rule absente pour ce triplet).
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
    // Pas de redirect vers /reservations/[id] : la page de détail attend un
    // shape enrichi (qrToken, distributor.name) que `/v1/reservations/active`
    // ne fournit pas aujourd'hui — bug pré-existant hors scope PR 4. On
    // affiche directement le récap + QR dans cette page sur succès.
  })

  const types = useMemo(
    () => (detailQuery.data ? groupAvailableTypes(detailQuery.data) : []),
    [detailQuery.data],
  )
  const days = availabilityQuery.data?.days ?? {}
  const dayKeys = Object.keys(days).sort()

  if (!user) return null

  // État succès : on remplace tout le flux par un récap + QR.
  if (reserveMutation.data) {
    return (
      <ConfirmationView
        reservation={reserveMutation.data}
        distributorName={detailQuery.data?.name ?? ''}
        itemTypeName={types.find((t) => t.id === itemTypeId)?.name ?? ''}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link
          href={`/distributors/${params.id}`}
          aria-label="Retour"
          className="rounded-full bg-white/10 p-2 hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/50">Réserver un créneau</p>
          <h1 className="font-display text-xl font-semibold">
            {detailQuery.data?.name ?? '…'}
          </h1>
        </div>
      </header>

      {/* Étape 1 : sport */}
      <section>
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/55">
          1. Choisis ton sport
        </h2>
        {types.length === 0 ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Ce distributeur ne contient aucun matériel pour le moment.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {types.map((t) => {
              const isSel = itemTypeId === t.id
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setItemTypeId(t.id)
                      setSelectedSlot(null)
                    }}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition',
                      isSel
                        ? 'border-emerald-400 bg-emerald-500/10 text-emerald-100'
                        : 'border-white/15 bg-white/5 text-white/80 hover:border-white/40',
                    )}
                  >
                    {t.name}
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
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/55">
            2. Combien de temps ?
          </h2>
          <ul className="grid grid-cols-5 gap-2">
            {SLOT_DURATIONS.map((d) => {
              const isSel = duration === d
              const price = pricesByDuration[d]
              const isDay = isDayPassDuration(d)
              // Tant que la query availability tourne (price === undefined dans
              // notre map mais on a forcé null si pas data), on n'affiche rien
              // sous la durée pour éviter le flash "—" puis valeur.
              const priceLoading = priceQueries[SLOT_DURATIONS.indexOf(d)]?.isPending ?? true
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => {
                      setDuration(d)
                      setSelectedSlot(null)
                    }}
                    className={cn(
                      'flex w-full flex-col items-center gap-0.5 rounded-xl border p-2.5 text-center transition',
                      isSel
                        ? 'border-emerald-400 bg-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30',
                      // Le bouton "Journée" reste visible mais légèrement
                      // distinct pour signaler le forfait (vs slot court).
                      isDay && !isSel && 'border-emerald-400/25',
                    )}
                  >
                    <Clock className="h-3.5 w-3.5 text-white/50" />
                    <span className="text-xs font-medium tabular-nums">{fmtDurationMinutes(d)}</span>
                    {priceLoading ? (
                      <span className="text-[10px] text-white/30 tabular-nums">·</span>
                    ) : (
                      <span
                        className={cn(
                          'text-[10px] tabular-nums',
                          price == null ? 'text-white/30' : 'text-emerald-300/80',
                        )}
                      >
                        {price == null ? '—' : fmtPrice(price)}
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
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/55">
            3. Choisis un créneau
          </h2>
          {availabilityQuery.isLoading && (
            <p className="text-sm text-white/50">Chargement des dispos…</p>
          )}
          {availabilityQuery.error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
              Erreur : {(availabilityQuery.error as Error).message}
            </p>
          )}
          {availabilityQuery.data && dayKeys.length === 0 && (
            <p className="text-sm text-white/50">Aucun créneau dans la fenêtre J→J+7.</p>
          )}
          {availabilityQuery.data && dayKeys.length > 0 && (() => {
            // Détecte le cas "aucun tarif configuré" : tous les slots ont
            // priceCents=null, càd aucune pricing_rule pour ce triplet
            // (commune × item_type × durée). Plutôt qu'un tooltip par
            // cellule (peu visible), on bannerise au-dessus de la grille.
            const allWithoutPrice = dayKeys.every((dk) =>
              (days[dk] ?? []).every((s) => s.priceCents === null),
            )
            return (
              <>
                {allWithoutPrice && (
                  <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-[12px] leading-relaxed text-amber-200">
                    Aucun tarif <strong>{fmtDurationMinutes(duration)}</strong> n'est configuré
                    pour ce sport sur ce distributeur. Demande à l'opérateur d'ajouter ce créneau
                    dans le dashboard, ou essaie une autre durée ci-dessus.
                  </p>
                )}
                {isDayPassDuration(duration) ? (
                  <DayPassGrid
                    days={days}
                    dayKeys={dayKeys}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                ) : (
                  <SlotGrid
                    days={days}
                    dayKeys={dayKeys}
                    selected={selectedSlot}
                    onSelect={setSelectedSlot}
                  />
                )}
              </>
            )
          })()}
        </section>
      )}

      {/* Étape 4 : récap + confirmation */}
      {selectedSlot && (
        <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium capitalize">{fmtFullSlot(selectedSlot, duration)}</p>
              <p className="mt-1 text-[12px] text-white/60">
                {fmtDurationMinutes(duration)} · {fmtPrice(selectedSlot.priceCents)}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                {isDayPassDuration(duration)
                  ? 'Aucun débit (MVP) — le prix est affiché à titre indicatif. Tu peux récupérer ton item à tout moment dans les heures d\'ouverture le jour réservé.'
                  : 'Aucun débit (MVP) — le prix est affiché à titre indicatif. Tu pourras ouvrir le casier en scannant ton QR le jour J, dans la fenêtre de 15 min après l\'heure de début.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={reserveMutation.isPending}
            onClick={() => reserveMutation.mutate()}
            className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reserveMutation.isPending ? 'Réservation…' : 'Réserver ce créneau'}
          </button>
          {reserveMutation.error && (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
              {(reserveMutation.error as Error).message}
            </p>
          )}
        </section>
      )}
    </main>
  )
}

function ConfirmationView({
  reservation,
  distributorName,
  itemTypeName,
}: {
  reservation: SlotReservationCreated
  distributorName: string
  itemTypeName: string
}) {
  const slotStart = new Date(reservation.slotStartAt)
  const slotEnd = new Date(reservation.slotEndAt)
  const isDayPass = reservation.durationMinutes === DAY_PASS_MINUTES
  const dateStr = slotStart.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
  const timeRange = isDayPass
    ? 'Forfait journée'
    : `${slotStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} – `
    + `${slotEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Accueil" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">Créneau réservé</p>
          <h1 className="font-display text-xl font-semibold">Présente ton QR le jour J</h1>
        </div>
      </header>

      <section className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-3">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium capitalize text-emerald-100">{dateStr}</p>
            <p className="mt-0.5 text-sm text-emerald-200/80">{timeRange}</p>
            <p className="mt-2 text-[12px] text-white/65">
              {itemTypeName} · {distributorName}
            </p>
            <p className="mt-1 text-[12px] font-medium text-white/85">
              {reservation.priceCents === 0
                ? 'Gratuit'
                : `${(reservation.priceCents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`}
            </p>
          </div>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6">
        <QRCodeSVG value={reservation.deviceToken} size={256} level="H" marginSize={0} />
        <p className="max-w-[256px] truncate text-center font-mono text-[11px] text-navy-900/50">
          {reservation.deviceToken.slice(0, 32)}…
        </p>
      </section>

      <p className="text-center text-[11px] leading-relaxed text-white/40">
        {isDayPass
          ? 'Scanne ce QR sur le distributeur pour ouvrir le casier. Tu peux venir à tout moment dans les heures d\'ouverture le jour réservé.'
          : 'Scanne ce QR sur le distributeur pour ouvrir le casier. Le QR reste valide jusqu\'à 15 min après l\'heure de début. Au-delà, le créneau est libéré et la réservation expire.'}
      </p>

      <Link
        href="/"
        className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center text-sm font-medium text-white/85 transition hover:border-white/30"
      >
        Retour à l'accueil
      </Link>
    </main>
  )
}

function SlotGrid({
  days,
  dayKeys,
  selected,
  onSelect,
}: {
  days: Record<string, AvailabilitySlot[]>
  dayKeys: string[]
  selected: AvailabilitySlot | null
  onSelect: (s: AvailabilitySlot) => void
}) {
  // Slots courts : colonnes par jour, heures empilées, prix supprimés
  // de chaque cellule (déjà rappelé sous le bouton de durée et dans le
  // récap). Cellule = heure seule = plus lisible.
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
      {dayKeys.map((dk) => {
        const d = fmtDayShort(dk)
        const slots = days[dk] ?? []
        return (
          <div key={dk} className="flex w-[72px] shrink-0 flex-col">
            <div className="mb-1.5 flex flex-col items-center gap-0">
              <span className="text-[10px] uppercase tracking-wider text-white/50">{d.weekday}</span>
              <span className="text-base font-semibold tabular-nums">{d.day}</span>
              <span className="text-[10px] text-white/40">{d.month}</span>
            </div>
            <ul className="flex flex-col gap-1">
              {slots.length === 0 && (
                <li className="text-center text-[10px] text-white/30">—</li>
              )}
              {slots.map((s) => {
                const isSel = selected?.startsAt === s.startsAt
                const noPrice = s.priceCents === null
                return (
                  <li key={s.startsAt}>
                    <button
                      type="button"
                      disabled={!s.available || noPrice}
                      onClick={() => onSelect(s)}
                      title={noPrice ? 'Pas de tarif configuré pour ce créneau' : undefined}
                      className={cn(
                        'flex w-full items-center justify-center rounded-md border px-1 py-1.5 text-center text-[11px] font-medium tabular-nums transition',
                        !s.available || noPrice
                          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-white/25'
                          : isSel
                            ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                            : 'border-white/10 bg-white/5 text-white/85 hover:border-emerald-400/40',
                      )}
                    >
                      {fmtHour(s.startsAt)}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Variante "forfait journée" : 1 carte par jour (le slot enumerator API
 * n'émet qu'un seul créneau par jour quand duration=1440). Pas de grille
 * d'horaires — on affiche juste le jour + le prix.
 */
function DayPassGrid({
  days,
  dayKeys,
  selected,
  onSelect,
}: {
  days: Record<string, AvailabilitySlot[]>
  dayKeys: string[]
  selected: AvailabilitySlot | null
  onSelect: (s: AvailabilitySlot) => void
}) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {dayKeys.map((dk) => {
        const d = fmtDayShort(dk)
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
              title={noPrice ? 'Pas de tarif "Journée" configuré pour ce sport' : undefined}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition',
                !slot.available || noPrice
                  ? 'cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30'
                  : isSel
                    ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                    : 'border-white/10 bg-white/5 text-white/85 hover:border-emerald-400/40',
              )}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] uppercase tracking-wider text-white/50">{d.weekday}</span>
                <span className="text-base font-semibold tabular-nums">{d.day}</span>
                <span className="text-[10px] text-white/40">{d.month}</span>
              </div>
              <span className="text-sm tabular-nums">
                {slot.priceCents === null
                  ? '—'
                  : slot.priceCents === 0
                    ? 'Gratuit'
                    : `${(slot.priceCents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
