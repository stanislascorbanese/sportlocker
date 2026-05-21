import Link from 'next/link'

import {
  ApiError,
  RESERVATION_STATUSES,
  fetchDistributors,
  fetchReservationDetail,
  fetchReservations,
  type Reservation,
  type ReservationDetail,
  type ReservationStatus,
} from '../../lib/api'
import { DEMO_RESERVATIONS, demoReservationDetail } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { ClickableRow } from './ClickableRow'
import { ExportCsvButton } from './ExportCsvButton'
import { ReservationDrawer } from './ReservationDrawer'
import { cn } from '../../lib/cn'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Réservations · SportLocker ops' }

const PAGE_SIZE = 50

const STATUS_STYLE: Record<ReservationStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: 'bg-violet-500/10',  border: 'border-violet-500/30',  text: 'text-violet-300' },
  pending:   { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-300' },
  active:    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300' },
  returned:  { bg: 'bg-zinc-500/10',    border: 'border-zinc-500/30',    text: 'text-zinc-300' },
  overdue:   { bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    text: 'text-rose-300' },
  cancelled: { bg: 'bg-zinc-700/30',    border: 'border-zinc-700/50',    text: 'text-zinc-400' },
  expired:   { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-300' },
}

function StatusBadge({ status }: { status: ReservationStatus }) {
  const s = STATUS_STYLE[status]
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
      s.bg, s.border, s.text,
    )}>
      {status}
    </span>
  )
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtUser(r: Reservation): string {
  return r.user.displayName ?? r.user.email
}

type SearchParams = {
  status?: string
  distributorId?: string
  from?: string
  to?: string
  cursor?: string
  detail?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function buildHref(
  params: SearchParams,
  set: SearchParams = {},
  clear: (keyof SearchParams)[] = [],
): string {
  const merged: SearchParams = { ...params, ...set }
  for (const k of clear) delete merged[k]
  const qs = new URLSearchParams()
  if (merged.status) qs.set('status', merged.status)
  if (merged.distributorId) qs.set('distributorId', merged.distributorId)
  if (merged.from) qs.set('from', merged.from)
  if (merged.to) qs.set('to', merged.to)
  if (merged.cursor) qs.set('cursor', merged.cursor)
  if (merged.detail) qs.set('detail', merged.detail)
  const s = qs.toString()
  return s ? `/reservations?${s}` : '/reservations'
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const status = (RESERVATION_STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as ReservationStatus)
    : undefined
  const distributorId = params.distributorId && /^[0-9a-f-]{36}$/i.test(params.distributorId)
    ? params.distributorId
    : undefined
  const from = params.from && DATE_RE.test(params.from) ? params.from : undefined
  const to   = params.to   && DATE_RE.test(params.to)   ? params.to   : undefined

  const filters: Parameters<typeof fetchReservations>[0] = { limit: PAGE_SIZE }
  if (status) filters.status = status
  if (distributorId) filters.distributorId = distributorId
  if (from) filters.from = from
  if (to)   filters.to   = to
  if (params.cursor) filters.cursor = params.cursor

  let page: Awaited<ReturnType<typeof fetchReservations>> | null = null
  let distributors: Awaited<ReturnType<typeof fetchDistributors>> = []
  let fetchError: string | null = null

  try {
    [page, distributors] = await Promise.all([
      fetchReservations(filters),
      fetchDistributors(),
    ])
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const realItems = page?.items ?? []
  const noFilterActive = !status && !distributorId && !from && !to && !params.cursor
  // Bascule en démo si l'API a planté OU si la table est vide sans filtre.
  // Avec filtre, on respecte le vrai résultat même s'il est vide (sinon UX trompeuse).
  const useDemo = (fetchError !== null) || (realItems.length === 0 && noFilterActive)

  const items = useDemo
    ? DEMO_RESERVATIONS.filter((r) => {
        if (status && r.status !== status) return false
        if (from && r.createdAt < `${from}T00:00:00`) return false
        if (to && r.createdAt > `${to}T23:59:59.999Z`) return false
        return true
      })
    : realItems

  // Drawer detail
  const detailId = params.detail && /^[0-9a-f-]{36}$/i.test(params.detail) ? params.detail : null
  let detail: ReservationDetail | null = null
  let detailError: string | undefined
  if (detailId) {
    if (useDemo) {
      const demoMatch = DEMO_RESERVATIONS.find((r) => r.id === detailId)
      if (demoMatch) detail = demoReservationDetail(demoMatch)
      else detailError = 'Réservation introuvable dans les données démo.'
    } else {
      try {
        detail = await fetchReservationDetail(detailId)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          detailError = 'Réservation introuvable.'
        } else if (err instanceof Error) {
          detailError = err.message
        } else {
          detailError = 'Erreur de chargement du détail.'
        }
      }
    }
  }

  const closeDrawerHref = buildHref(params, {}, ['detail'])

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">Réservations</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {items.length} affichée{items.length > 1 ? 's' : ''}
            {!useDemo && page?.nextCursor ? ' · pagination disponible' : ''}
            {useDemo && ' · données fictives — branchez un token admin valide pour voir les vraies'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton filters={{
            ...(status ? { status } : {}),
            ...(distributorId ? { distributorId } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
          }} />
          <RefreshButton />
        </div>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-navy-800 p-4 sm:flex sm:flex-wrap sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="status" className="text-[11px] uppercase tracking-wide text-white/50">Statut</label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="min-w-[140px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Tous</option>
            {RESERVATION_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="distributorId" className="text-[11px] uppercase tracking-wide text-white/50">Distributeur</label>
          <select
            id="distributorId"
            name="distributorId"
            defaultValue={distributorId ?? ''}
            className="min-w-[200px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Tous</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="from" className="text-[11px] uppercase tracking-wide text-white/50">Du</label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="to" className="text-[11px] uppercase tracking-wide text-white/50">Au</label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ''}
            className="rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
        >
          Filtrer
        </button>

        {(status || distributorId || from || to) && (
          <Link
            href="/reservations"
            className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
          >
            Réinitialiser
          </Link>
        )}
      </form>

      {fetchError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200/80">
          <p className="font-medium">API admin indisponible — affichage en mode démo</p>
          <p className="mt-1 font-mono text-[11px] text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {!useDemo && items.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-navy-800 p-8 text-center text-sm text-white/55">
          Aucune réservation pour ces filtres.
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-navy-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">Créée le</th>
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Distributeur</th>
                <th className="px-4 py-3 font-medium">Article</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Échéance</th>
                <th className="px-4 py-3 font-medium text-right">Prolong.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((r) => (
                <ClickableRow
                  key={r.id}
                  href={buildHref(params, { detail: r.id })}
                  selected={r.id === detailId}
                >
                  <td className="px-4 py-3 text-white/80 tabular-nums">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="text-white">{fmtUser(r)}</div>
                    {r.user.displayName && (
                      <div className="mt-0.5 text-[11px] text-white/40">{r.user.email}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white">{r.distributor.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-white/40">{r.distributor.serialNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-white/80">{r.item.typeName}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-white/70 tabular-nums">
                    {r.status === 'pending' ? fmtDate(r.expiresAt) : fmtDate(r.dueAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/70 tabular-nums">
                    {r.extensionCount > 0 ? `×${r.extensionCount}` : '—'}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!useDemo && page?.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={buildHref(params, { cursor: page.nextCursor }, ['detail'])}
            className="inline-flex items-center rounded-lg border border-white/15 bg-navy-800 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Page suivante →
          </Link>
        </div>
      )}

      {detailId && (
        <ReservationDrawer
          detail={detail}
          closeHref={closeDrawerHref}
          demo={useDemo}
          error={detailError}
        />
      )}
    </div>
  )
}
