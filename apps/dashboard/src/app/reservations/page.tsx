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
import { getLang } from '../../lib/lang-server'
import { commonStrings, fmtDateTime } from '../../lib/i18n/common'
import { reservationsStrings, reservationStatusLabel } from '../../lib/i18n/reservations'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Réservations · SportLocker ops' }

const PAGE_SIZE = 50

const STATUS_STYLE: Record<ReservationStatus, { bg: string; border: string; text: string }> = {
  scheduled: {
    bg: 'bg-violet-100 dark:bg-violet-500/10',
    border: 'border-violet-300 dark:border-violet-500/30',
    text: 'text-violet-700 dark:text-violet-300',
  },
  pending: {
    bg: 'bg-sky-100 dark:bg-sky-500/10',
    border: 'border-sky-300 dark:border-sky-500/30',
    text: 'text-sky-700 dark:text-sky-300',
  },
  active: {
    bg: 'bg-emerald-100 dark:bg-emerald-500/10',
    border: 'border-emerald-300 dark:border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  returned: {
    bg: 'bg-zinc-100 dark:bg-zinc-500/10',
    border: 'border-zinc-300 dark:border-zinc-500/30',
    text: 'text-zinc-700 dark:text-zinc-300',
  },
  overdue: {
    bg: 'bg-rose-100 dark:bg-rose-500/10',
    border: 'border-rose-300 dark:border-rose-500/30',
    text: 'text-rose-700 dark:text-rose-300',
  },
  cancelled: {
    bg: 'bg-zinc-200 dark:bg-zinc-700/30',
    border: 'border-zinc-300 dark:border-zinc-700/50',
    text: 'text-zinc-600 dark:text-zinc-400',
  },
  expired: {
    bg: 'bg-amber-100 dark:bg-amber-500/10',
    border: 'border-amber-300 dark:border-amber-500/30',
    text: 'text-amber-700 dark:text-amber-300',
  },
}

function StatusBadge({
  status,
  label,
}: {
  status: ReservationStatus
  label: string
}) {
  const s = STATUS_STYLE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
        s.bg,
        s.border,
        s.text,
      )}
    >
      {label}
    </span>
  )
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
  const lang = await getLang()
  const t = reservationsStrings(lang)
  const c = commonStrings(lang)
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
      else detailError = t.distributorNotFoundDemo
    } else {
      try {
        detail = await fetchReservationDetail(detailId)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          detailError = t.reservationNotFound
        } else if (err instanceof Error) {
          detailError = err.message
        } else {
          detailError = t.detailLoadError
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
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
              {t.pageTitle}
            </h2>
            {useDemo && (
              <span className="rounded-md border px-2 py-0.5 text-eyebrow font-semibold uppercase border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {items.length} {items.length > 1 ? t.displayedMany : t.displayed1}
            {!useDemo && page?.nextCursor ? ` · ${t.paginationAvailable}` : ''}
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExportCsvButton
            filters={{
              ...(status ? { status } : {}),
              ...(distributorId ? { distributorId } : {}),
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
            }}
          />
          <RefreshButton />
        </div>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-card border p-4 sm:flex sm:flex-wrap sm:items-end border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-navy-800">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label
            htmlFor="status"
            className="text-eyebrow uppercase text-gray-500 dark:text-white/50"
          >
            {c.status}
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="min-w-[140px] rounded-lg border px-2 py-1.5 text-sm border-gray-300 bg-white text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            {RESERVATION_STATUSES.map((s) => (
              <option key={s} value={s}>{reservationStatusLabel(lang, s)}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label
            htmlFor="distributorId"
            className="text-eyebrow uppercase text-gray-500 dark:text-white/50"
          >
            {t.filterDistributor}
          </label>
          <select
            id="distributorId"
            name="distributorId"
            defaultValue={distributorId ?? ''}
            className="min-w-[200px] rounded-lg border px-2 py-1.5 text-sm border-gray-300 bg-white text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="from" className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
            {c.from}
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="rounded-lg border px-2 py-1.5 text-sm border-gray-300 bg-white text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="to" className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
            {c.to}
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ''}
            className="rounded-lg border px-2 py-1.5 text-sm border-gray-300 bg-white text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-base ease-out-soft bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
        >
          {c.filter}
        </button>

        {(status || distributorId || from || to) && (
          <Link
            href="/reservations"
            className="text-meta underline-offset-2 transition-colors duration-base text-gray-500 hover:text-navy-900 hover:underline dark:text-white/50 dark:hover:text-white/80"
          >
            {c.reset}
          </Link>
        )}
      </form>

      {fetchError && (
        <div className="rounded-card border p-3 text-sm border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700/80 dark:text-amber-300/70">
            {fetchError}
          </p>
        </div>
      )}

      {!useDemo && items.length === 0 && (
        <div className="rounded-card border p-8 text-center text-sm border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-navy-800 dark:text-white/55">
          {t.emptyForFilters}
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-eyebrow uppercase bg-gray-100 text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colCreatedAt}</th>
                <th className="px-4 py-3 font-medium">{t.colUser}</th>
                <th className="px-4 py-3 font-medium">{t.colDistributor}</th>
                <th className="px-4 py-3 font-medium">{t.colItem}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                <th className="px-4 py-3 font-medium">{t.colDueAt}</th>
                <th className="px-4 py-3 text-right font-medium">{t.colExtensions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {items.map((r) => (
                <ClickableRow
                  key={r.id}
                  href={buildHref(params, { detail: r.id })}
                  selected={r.id === detailId}
                >
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-white/80">
                    {fmtDateTime(lang, r.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-navy-900 dark:text-white">{fmtUser(r)}</div>
                    {r.user.displayName && (
                      <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">
                        {r.user.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-navy-900 dark:text-white">{r.distributor.name}</div>
                    <div className="mt-0.5 font-mono text-meta text-gray-500 dark:text-white/40">
                      {r.distributor.serialNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-white/80">{r.item.typeName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} label={reservationStatusLabel(lang, r.status)} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-white/70">
                    {r.status === 'pending' ? fmtDateTime(lang, r.expiresAt) : fmtDateTime(lang, r.dueAt)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-white/70">
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
            className="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors duration-base border-gray-200 bg-white text-navy-900 hover:border-gray-300 dark:border-white/15 dark:bg-navy-800 dark:text-white/80 dark:hover:border-white/30 dark:hover:text-white"
          >
            {c.nextPage} →
          </Link>
        </div>
      )}

      {detailId && (
        <ReservationDrawer
          detail={detail}
          closeHref={closeDrawerHref}
          demo={useDemo}
          error={detailError}
          lang={lang}
        />
      )}
    </div>
  )
}
