'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Package } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  createReservation,
  fetchDistributorDetail,
  type DistributorDetail,
  type LockerItemType,
} from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'

/**
 * Détail d'un distributeur : affiche le statut, le nombre de casiers idle,
 * la liste des matériels disponibles (regroupés par type) et la liste des
 * casiers physiques (état + contenu).
 *
 * L'utilisateur choisit un type de matériel à emprunter parmi ceux qui ont
 * au moins un casier `idle`. L'API choisit ensuite le casier le plus ancien.
 */
export default function DistributorDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const user = useRequireAuth()
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['distributor-detail', params.id],
    queryFn: () => fetchDistributorDetail(params.id),
    enabled: Boolean(user && params.id),
  })

  const reserveMutation = useMutation({
    mutationFn: () =>
      createReservation({ distributorId: params.id, itemTypeId: selectedTypeId ?? '' }),
    onSuccess: (reservation) => router.push(`/reservations/${reservation.id}`),
  })

  if (!user) return null

  const groups = detailQuery.data ? groupAvailableByType(detailQuery.data) : []
  const canReserve =
    detailQuery.data != null &&
    !reserveMutation.isPending &&
    detailQuery.data.idleLockers > 0 &&
    (groups.length === 0 || selectedTypeId != null)

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/50">Distributeur</p>
          <h1 className="font-display text-xl font-semibold">
            {detailQuery.data?.name ?? '…'}
          </h1>
        </div>
      </header>

      {detailQuery.isLoading && <p className="text-sm text-white/50">Chargement…</p>}
      {detailQuery.error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          Erreur : {(detailQuery.error as Error).message}
        </p>
      )}

      {detailQuery.data && (
        <DetailContent
          d={detailQuery.data}
          groups={groups}
          selectedTypeId={selectedTypeId}
          onSelect={setSelectedTypeId}
        />
      )}

      {detailQuery.data && (
        <>
          <Link
            href={`/distributors/${params.id}/book`}
            className="rounded-xl bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-navy-900 transition hover:bg-emerald-400"
          >
            Réserver un créneau →
          </Link>
          <button
            type="button"
            disabled={!canReserve}
            onClick={() => reserveMutation.mutate()}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white/85 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reserveMutation.isPending
              ? 'Réservation…'
              : detailQuery.data.idleLockers === 0
                ? 'Aucun casier disponible (immédiat)'
                : groups.length > 0 && selectedTypeId == null
                  ? 'Emprunter maintenant — choisis un matériel'
                  : 'Emprunter maintenant (legacy)'}
          </button>
          {reserveMutation.error && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
              {(reserveMutation.error as Error).message}
            </p>
          )}
        </>
      )}
    </main>
  )
}

type AvailableGroup = {
  itemType: LockerItemType
  count: number
}

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
  return (
    <>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/50">Adresse</p>
            <p className="text-sm">{d.addressLine ?? '—'}</p>
            {d.latitude != null && d.longitude != null && (
              <p className="mt-1 font-mono text-[10px] text-white/40">
                {d.latitude.toFixed(5)}, {d.longitude.toFixed(5)}
              </p>
            )}
          </div>
          <StatusBadge status={d.status} />
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-2xl font-bold">
              {d.idleLockers}
              <span className="text-white/40 text-sm font-normal">/{d.lockerCount}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">
              casiers libres
            </p>
          </div>
        </div>
      </section>

      {groups.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/55">
            Matériel disponible
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
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition',
                      isSelected
                        ? 'border-emerald-400 bg-emerald-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/30',
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
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                        <Package className="h-5 w-5 text-white/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.itemType.name}</p>
                      <p className="text-[11px] text-white/50">
                        {g.count} dispo{g.count > 1 ? 's' : ''}
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
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-white/55">
            Casiers ({d.lockers.length})
          </h2>
          <ul className="grid grid-cols-4 gap-2">
            {d.lockers.map((l) => (
              <li
                key={l.id}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-2 text-center',
                  l.state === 'idle'
                    ? 'border-emerald-400/30 bg-emerald-500/5'
                    : 'border-white/10 bg-white/5 opacity-70',
                )}
                title={l.itemType?.name ?? 'Vide'}
              >
                <span className="text-[10px] text-white/40">#{l.position + 1}</span>
                <span className="truncate text-[11px] font-medium">
                  {l.itemType?.name ?? '—'}
                </span>
                <span
                  className={cn(
                    'text-[9px] uppercase tracking-wider',
                    l.state === 'idle' ? 'text-emerald-300' : 'text-white/40',
                  )}
                >
                  {LOCKER_STATE_LABELS[l.state]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

const LOCKER_STATE_LABELS: Record<DistributorDetail['lockers'][number]['state'], string> = {
  idle: 'Libre',
  reserved: 'Réservé',
  active: 'Emprunté',
  returning: 'Retour',
  fault: 'Panne',
}

function StatusBadge({ status }: { status: DistributorDetail['status'] }) {
  const styles: Record<DistributorDetail['status'], string> = {
    online: 'bg-emerald-500/20 text-emerald-200',
    offline: 'bg-rose-500/20 text-rose-200',
    maintenance: 'bg-amber-500/20 text-amber-200',
    decommissioned: 'bg-white/10 text-white/50',
  }
  const labels: Record<DistributorDetail['status'], string> = {
    online: 'En ligne',
    offline: 'Hors ligne',
    maintenance: 'Maintenance',
    decommissioned: 'Retiré',
  }
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider',
        styles[status],
      )}
    >
      {labels[status]}
    </span>
  )
}
