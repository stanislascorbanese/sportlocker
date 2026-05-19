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

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Audit · SportLocker ops' }

const PAGE_SIZE = 100

const EVENT_STYLE: Record<LockerEventType, { dot: string; label: string }> = {
  reserved:    { dot: 'bg-sky-400',     label: 'Réservé' },
  opened:      { dot: 'bg-emerald-400', label: 'Ouverture casier' },
  closed:      { dot: 'bg-emerald-500', label: 'Fermeture casier' },
  extended:    { dot: 'bg-amber-400',   label: 'Prolongation' },
  returned:    { dot: 'bg-zinc-400',    label: 'Retour confirmé' },
  cancelled:   { dot: 'bg-rose-400',    label: 'Annulé' },
  expired:     { dot: 'bg-amber-500',   label: 'Expiré' },
  fault:       { dot: 'bg-orange-500',  label: 'Incident' },
  maintenance: { dot: 'bg-purple-400',  label: 'Maintenance' },
}

const SOURCE_STYLE: Record<string, string> = {
  admin:    'bg-rose-500/10 border-rose-500/30 text-rose-300',
  api:      'bg-sky-500/10 border-sky-500/30 text-sky-300',
  firmware: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  system:   'bg-zinc-500/10 border-zinc-500/30 text-zinc-300',
}

function sourceClass(src: string): string {
  return SOURCE_STYLE[src] ?? 'bg-white/5 border-white/10 text-white/70'
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function fmtRelative(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
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
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-3xl">Audit / Activité</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {items.length} événement{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
            {!useDemo && page?.nextCursor ? ' · pagination disponible' : ''}
            {useDemo && ' · données fictives — branchez un token admin valide pour voir les vraies'}
          </p>
        </div>
        <RefreshButton />
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-navy-800 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="eventType" className="text-[11px] uppercase tracking-wide text-white/50">Type</label>
          <select
            id="eventType"
            name="eventType"
            defaultValue={eventType ?? ''}
            className="min-w-[140px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Tous</option>
            {LOCKER_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="source" className="text-[11px] uppercase tracking-wide text-white/50">Source</label>
          <select
            id="source"
            name="source"
            defaultValue={source ?? ''}
            className="min-w-[140px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Toutes</option>
            {KNOWN_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
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

        <div className="flex flex-col gap-1">
          <label htmlFor="from" className="text-[11px] uppercase tracking-wide text-white/50">Du</label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ''}
            className="rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          />
        </div>

        <div className="flex flex-col gap-1">
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

        {(eventType || source || distributorId || from || to) && (
          <Link
            href="/audit"
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
          Aucun événement pour ces filtres.
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <ol className="space-y-4 border-l-2 border-white/10 pl-5">
            {items.map((e) => {
              const style = EVENT_STYLE[e.eventType]
              const hasMeta = Object.keys(e.metadata).length > 0
              return (
                <li key={e.id} className="relative">
                  <span
                    className={cn(
                      'absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full ring-4 ring-navy-800',
                      style.dot,
                    )}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-white">{style.label}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        sourceClass(e.source),
                      )}
                    >
                      {e.source}
                    </span>
                    <span className="text-[11px] text-white/40 tabular-nums">{fmtRelative(e.createdAt)}</span>
                    <span className="text-[11px] text-white/30 tabular-nums">· {fmtDateTime(e.createdAt)}</span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[12px] text-white/70">
                    <span>
                      <span className="text-white/40">Distributeur </span>
                      <Link
                        href={`/distributors/${e.distributor.id}/edit`}
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        {e.distributor.name}
                      </Link>{' '}
                      <span className="font-mono text-[11px] text-white/40">({e.distributor.serialNumber})</span>
                    </span>
                    <span className="text-white/40">·</span>
                    <span>
                      <span className="text-white/40">Casier </span>
                      <span className="tabular-nums text-white/80">#{e.locker.position}</span>
                    </span>
                    {e.reservation && (
                      <>
                        <span className="text-white/40">·</span>
                        <span>
                          <span className="text-white/40">Utilisateur </span>
                          <Link
                            href={`/users?q=${encodeURIComponent(e.reservation.userEmail)}`}
                            className="text-emerald-300 hover:text-emerald-200"
                          >
                            {e.reservation.userEmail}
                          </Link>
                        </span>
                        <span className="text-white/40">·</span>
                        <Link
                          href={`/reservations?detail=${e.reservation.id}`}
                          className="text-[11px] text-white/60 underline-offset-2 hover:text-white hover:underline"
                        >
                          voir réservation →
                        </Link>
                      </>
                    )}
                  </div>

                  {hasMeta && (
                    <pre className="mt-2 overflow-x-auto rounded border border-white/5 bg-navy-900/50 p-2 font-mono text-[10px] text-white/55">
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
            className="inline-flex items-center rounded-lg border border-white/15 bg-navy-800 px-3 py-1.5 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Page suivante →
          </Link>
        </div>
      )}
    </div>
  )
}
