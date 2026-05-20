'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Package } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'

import { createReservation, fetchDistributorDetail, type DistributorDetail } from '../../../lib/api'
import { useRequireAuth } from '../../../lib/auth-context'
import { cn } from '../../../lib/cn'

/**
 * Détail d'un distributeur : affiche le statut, le nombre de casiers idle,
 * et propose à l'utilisateur de réserver un casier disponible.
 *
 * NOTE : à terme cette page listera les item-types présents dans les
 * casiers idle (ballons, raquettes, etc.) et l'utilisateur choisira un
 * type. Pour le MVP on réserve directement le premier casier idle sans
 * choix d'item — on passe `itemTypeId` vide et l'API se débrouille.
 */
export default function DistributorDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const user = useRequireAuth()

  const detailQuery = useQuery({
    queryKey: ['distributor-detail', params.id],
    queryFn: () => fetchDistributorDetail(params.id),
    enabled: Boolean(user && params.id),
  })

  const reserveMutation = useMutation({
    mutationFn: () => createReservation({ distributorId: params.id, itemTypeId: '' }),
    onSuccess: (reservation) => router.push(`/reservations/${reservation.id}`),
  })

  if (!user) return null

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/map" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
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

      {detailQuery.data && <DetailContent d={detailQuery.data} />}

      {detailQuery.data && (
        <>
          <button
            type="button"
            disabled={reserveMutation.isPending || detailQuery.data.idleLockers === 0}
            onClick={() => reserveMutation.mutate()}
            className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reserveMutation.isPending
              ? 'Réservation…'
              : detailQuery.data.idleLockers === 0
                ? 'Aucun casier disponible'
                : 'Réserver un casier'}
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

function DetailContent({ d }: { d: DistributorDetail }) {
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
              {d.idleLockers}<span className="text-white/40 text-sm font-normal">/{d.lockerCount}</span>
            </p>
            <p className="text-[11px] uppercase tracking-wider text-emerald-300/80">casiers libres</p>
          </div>
        </div>
      </section>
    </>
  )
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
    <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider', styles[status])}>
      {labels[status]}
    </span>
  )
}
