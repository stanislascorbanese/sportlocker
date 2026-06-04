import Link from 'next/link'

import {
  LOCKER_EVENT_TYPES,
  fetchAuditEvents,
  fetchDistributors,
  type AuditEvent,
  type LockerEventType,
} from '../../lib/api'
import { demoAuditEvents } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { cn } from '../../lib/cn'
import { getLang } from '../../lib/lang-server'
import type { Lang } from '../../lib/lang'
import { commonStrings, fmtRelative } from '../../lib/i18n/common'
import { auditStrings, lockerEventLabel } from '../../lib/i18n/audit'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit · SportLocker ops' }

const PAGE_SIZE = 100

// Couleurs des "dots" timeline : volontairement identiques light/dark pour
// préserver le code visuel (sky = reserved, emerald = open/close, etc.).
// On joue uniquement sur les surfaces (border/bg) pour adapter le mode.
const EVENT_DOT: Record<LockerEventType, string> = {
  reserved:    'bg-sky-400',
  opened:      'bg-emerald-400',
  closed:      'bg-emerald-500',
  extended:    'bg-amber-400',
  returned:    'bg-zinc-400',
  cancelled:   'bg-rose-400',
  expired:     'bg-amber-500',
  fault:       'bg-orange-500',
  maintenance: 'bg-purple-400',
}

const SOURCE_STYLE: Record<string, string> = {
  admin:
    'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-300',
  api:
    'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/30 dark:text-sky-300',
  firmware:
    'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300',
  system:
    'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-500/10 dark:border-zinc-500/30 dark:text-zinc-300',
}

function sourceClass(src: string): string {
  return (
    SOURCE_STYLE[src] ??
    'bg-gray-50 border-gray-200 text-gray-700 dark:bg-white/5 dark:border-white/10 dark:text-white/70'
  )
}

function fmtDateTimeFull(lang: Lang, iso: string): string {
  return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

type SearchParams = {
  from?: string
  to?: string
  eventType?: string
  source?: string
  distributorId?: string
  cursor?: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f-]{36}$/i

/** Sources observées dans la wild : on les expose en select pour faciliter
 *  le drill-down. Reste libre côté backend (string match exact). */
const KNOWN_SOURCES = ['admin', 'api', 'firmware', 'system'] as const

function buildHref(
  params: SearchParams,
  set: SearchParams = {},
  clear: (keyof SearchParams)[] = [],
): string {
  const merged: SearchParams = { ...params, ...set }
  for (const k of clear) delete merged[k]
  const qs = new URLSearchParams()
  if (merged.from)          qs.set('from', merged.from)
  if (merged.to)            qs.set('to', merged.to)
  if (merged.eventType)     qs.set('eventType', merged.eventType)
  if (merged.source)        qs.set('source', merged.source)
  if (merged.distributorId) qs.set('distributorId', merged.distributorId)
  if (merged.cursor)        qs.set('cursor', merged.cursor)
  const s = qs.toString()
  return s ? `/audit?${s}` : '/audit'
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const lang = await getLang()
  const t = auditStrings(lang)
  const c = commonStrings(lang)
  const eventType = (LOCKER_EVENT_TYPES as readonly string[]).includes(params.eventType ?? '')
    ? (params.eventType as LockerEventType)
    : undefined
  const source = params.source && /^[a-z0-9_-]{1,40}$/i.test(params.source)
    ? params.source
    : undefined
  const distributorId = params.distributorId && UUID_RE.test(params.distributorId)
    ? params.distributorId
    : undefined
  const from = params.from && DATE_RE.test(params.from) ? params.from : undefined
  const to   = params.to   && DATE_RE.test(params.to)   ? params.to   : undefined

  const filters: Parameters<typeof fetchAuditEvents>[0] = { limit: PAGE_SIZE }
  if (eventType) filters.eventType = eventType
  if (source)    filters.source    = source
  if (distributorId) filters.distributorId = distributorId
  if (from) filters.from = from
  if (to)   filters.to   = to
  if (params.cursor) filters.cursor = params.cursor

  let page: Awaited<ReturnType<typeof fetchAuditEvents>> | null = null
  let distributors: Awaited<ReturnType<typeof fetchDistributors>> = []
  let fetchError: string | null = null

  try {
    [page, distributors] = await Promise.all([
      fetchAuditEvents(filters),
      fetchDistributors(),
    ])
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const realItems = page?.items ?? []
  const noFilterActive = !eventType && !source && !distributorId && !from && !to && !params.cursor
  // Démo si l'API a planté OU si la table est vide sans filtre.
  // Avec filtre, on respecte le vrai résultat (vide = "aucun event pour ces filtres").
  const useDemo = (fetchError !== null) || (realItems.length === 0 && noFilterActive)

  const items: AuditEvent[] = useDemo
    ? demoAuditEvents().filter((e) => {
        if (eventType && e.eventType !== eventType) return false
        if (source && e.source !== source) return false
        if (distributorId && e.distributor.id !== distributorId) return false
        if (from && e.createdAt < `${from}T00:00:00`) return false
        if (to && e.createdAt > `${to}T23:59:59.999Z`) return false
        return true
      })
    : realItems

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-2xl text-navy-900 sm:text-3xl dark:text-white">
              {t.pageTitle}
            </h2>
            {useDemo && (
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-eyebrow text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                {c.demo}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            {items.length} {items.length > 1 ? t.eventMany : t.event1} {items.length > 1 ? t.displayedMany : t.displayed1}
            {!useDemo && page?.nextCursor ? ` · ${t.pagination}` : ''}
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <RefreshButton />
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-card border bg-white p-4 shadow-card sm:flex sm:flex-wrap sm:items-end dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="eventType" className="text-eyebrow text-gray-500 dark:text-white/50">{t.type}</label>
          <select
            id="eventType"
            name="eventType"
            defaultValue={eventType ?? ''}
            className="min-w-[140px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            {LOCKER_EVENT_TYPES.map((evt) => (
              <option key={evt} value={evt}>{lockerEventLabel(lang, evt)}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="source" className="text-eyebrow text-gray-500 dark:text-white/50">{t.source}</label>
          <select
            id="source"
            name="source"
            defaultValue={source ?? ''}
            className="min-w-[140px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{t.sourceAll}</option>
            {KNOWN_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="distributorId" className="text-eyebrow text-gray-500 dark:text-white/50">{t.distributor}</label>
          <select
            id="distributorId"
            name="distributorId"
            defaultValue={distributorId ?? ''}
            className="min-w-[200px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="from" className="text-eyebrow text-gray-500 dark:text-white/50">{c.from}</label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="to" className="text-eyebrow text-gray-500 dark:text-white/50">{c.to}</label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to ?? ''}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
        >
          {c.filter}
        </button>

        {(eventType || source || distributorId || from || to) && (
          <Link
            href="/audit"
            className="text-xs text-gray-500 underline-offset-2 transition-colors duration-base hover:text-navy-900 hover:underline dark:text-white/50 dark:hover:text-white/80"
          >
            {c.reset}
          </Link>
        )}
      </form>

      {fetchError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200/80">
          <p className="font-medium">{c.apiErrorTitle}</p>
          <p className="mt-1 font-mono text-meta text-amber-700 dark:text-amber-300/70">{fetchError}</p>
        </div>
      )}

      {!useDemo && items.length === 0 && (
        <div className="rounded-card border bg-white p-8 text-center text-sm text-gray-600 shadow-card dark:border-white/10 dark:bg-navy-800 dark:text-white/55 dark:shadow-none">
          {t.emptyForFilters}
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-card border bg-white p-4 shadow-card sm:p-6 dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
          <ol className="space-y-4 border-l-2 border-gray-200 pl-5 dark:border-white/10">
            {items.map((e) => {
              const hasMeta = Object.keys(e.metadata).length > 0
              return (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-white dark:ring-navy-800',
                      EVENT_DOT[e.eventType],
                    )}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-navy-900 dark:text-white">{lockerEventLabel(lang, e.eventType)}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-meta font-medium uppercase tracking-wide',
                        sourceClass(e.source),
                      )}
                    >
                      {e.source}
                    </span>
                    <span className="text-meta tabular-nums text-gray-500 dark:text-white/40">{fmtRelative(lang, e.createdAt)}</span>
                    <span className="text-meta tabular-nums text-gray-400 dark:text-white/30">· {fmtDateTimeFull(lang, e.createdAt)}</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[12px] text-gray-700 dark:text-white/70">
                    <span>
                      <span className="text-gray-500 dark:text-white/40">{t.rowDistributor} </span>
                      <Link
                        href={`/distributors/${e.distributor.id}/edit`}
                        className="text-emerald-700 transition-colors duration-base hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
                      >
                        {e.distributor.name}
                      </Link>{' '}
                      <span className="font-mono text-meta text-gray-500 dark:text-white/40">({e.distributor.serialNumber})</span>
                    </span>
                    <span className="text-gray-400 dark:text-white/40">·</span>
                    <span>
                      <span className="text-gray-500 dark:text-white/40">{t.rowLocker} </span>
                      <span className="tabular-nums text-navy-900 dark:text-white/80">#{e.locker.position}</span>
                    </span>
                    {e.reservation && (
                      <>
                        <span className="text-gray-400 dark:text-white/40">·</span>
                        <span>
                          <span className="text-gray-500 dark:text-white/40">{t.rowUser} </span>
                          <Link
                            href={`/users?q=${encodeURIComponent(e.reservation.userEmail)}`}
                            className="text-emerald-700 transition-colors duration-base hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
                          >
                            {e.reservation.userEmail}
                          </Link>
                        </span>
                        <span className="text-gray-400 dark:text-white/40">·</span>
                        <Link
                          href={`/reservations?detail=${e.reservation.id}`}
                          className="text-meta text-gray-600 underline-offset-2 transition-colors duration-base hover:text-navy-900 hover:underline dark:text-white/60 dark:hover:text-white"
                        >
                          {t.rowSeeReservation}
                        </Link>
                      </>
                    )}
                  </div>

                  {hasMeta && (
                    <pre className="mt-2 overflow-x-auto rounded border bg-gray-50 p-2 font-mono text-[10px] text-gray-700 dark:border-white/5 dark:bg-navy-900/50 dark:text-white/55">
                      {JSON.stringify(e.metadata, null, 2)}
                    </pre>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {!useDemo && page?.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={buildHref(params, { cursor: page.nextCursor })}
            className="inline-flex items-center rounded-lg border bg-white px-3 py-1.5 text-sm text-navy-900 transition-colors duration-base ease-out-soft hover:bg-gray-50 dark:border-white/15 dark:bg-navy-800 dark:text-white/80 dark:hover:border-white/30 dark:hover:text-white"
          >
            {c.nextPage} →
          </Link>
        </div>
      )}
    </div>
  )
}
