import Link from 'next/link'
import { X } from 'lucide-react'

import type { LockerEventType, ReservationDetail, ReservationStatus } from '../../lib/api'
import { cn } from '../../lib/cn'
import { ForceCancelButton } from './ForceCancelButton'

const STATUS_STYLE: Record<ReservationStatus, string> = {
  pending:   'bg-sky-500/10 border-sky-500/30 text-sky-300',
  active:    'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  returned:  'bg-zinc-500/10 border-zinc-500/30 text-zinc-300',
  overdue:   'bg-rose-500/10 border-rose-500/30 text-rose-300',
  cancelled: 'bg-zinc-700/30 border-zinc-700/50 text-zinc-400',
  expired:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
}

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

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
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

export function ReservationDrawer({
  detail,
  closeHref,
  demo = false,
  error,
}: {
  detail: ReservationDetail | null
  closeHref: string
  demo?: boolean
  error?: string | undefined
}) {
  const cancellable = detail && (
    detail.status === 'pending'
    || detail.status === 'active'
    || detail.status === 'overdue'
  )

  return (
    <>
      {/* Backdrop */}
      <Link
        href={closeHref}
        scroll={false}
        className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
        aria-label="Fermer le détail"
      />

      {/* Panneau */}
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-navy-900 shadow-2xl"
        role="dialog"
        aria-label="Détail réservation"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Réservation
            </h3>
            {detail ? (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                    STATUS_STYLE[detail.status],
                  )}>
                    {detail.status}
                  </span>
                  {demo && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      Démo
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-white/40">{detail.id}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/60">{error ?? 'Chargement…'}</p>
            )}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="rounded-lg border border-white/10 p-1.5 text-white/60 transition hover:border-white/30 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </Link>
        </header>

        {!detail ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-white/50">
            {error ?? 'Chargement…'}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Section Utilisateur */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Utilisateur</h4>
              <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                <div className="text-sm text-white">{detail.user.displayName ?? detail.user.email}</div>
                {detail.user.displayName && (
                  <div className="mt-0.5 text-[12px] text-white/50">{detail.user.email}</div>
                )}
                <Link
                  href={`/users?q=${encodeURIComponent(detail.user.email)}`}
                  className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200"
                >
                  voir profil utilisateur →
                </Link>
              </div>
            </section>

            {/* Section Distributeur + Item */}
            <section className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Distributeur</h4>
                <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                  <div className="text-sm text-white">{detail.distributor.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-white/40">{detail.distributor.serialNumber}</div>
                  <Link
                    href={`/distributors/${detail.distributor.id}/edit`}
                    className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200"
                  >
                    fiche →
                  </Link>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Article</h4>
                <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                  <div className="text-sm text-white">{detail.item.typeName}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-white/40 truncate">{detail.item.id}</div>
                </div>
              </div>
            </section>

            {/* Section Métadonnées */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Cycle de vie</h4>
              <dl className="rounded-lg border border-white/10 bg-navy-800 divide-y divide-white/5 text-sm">
                <MetaRow label="Créée" value={fmtDateTime(detail.createdAt)} />
                <MetaRow label="Expire (QR)" value={fmtDateTime(detail.expiresAt)} />
                <MetaRow label="Ouverte" value={fmtDateTime(detail.openedAt)} />
                <MetaRow label="Due le" value={fmtDateTime(detail.dueAt)} />
                <MetaRow label="Retournée" value={fmtDateTime(detail.returnedAt)} />
                <MetaRow label="Prolongations" value={detail.extensionCount > 0 ? `×${detail.extensionCount}` : '—'} />
                {detail.cancellationReason && (
                  <MetaRow label="Raison annulation" value={detail.cancellationReason} mono />
                )}
                <MetaRow label="QR JTI" value={detail.qrJti} mono />
              </dl>
            </section>

            {/* Section Timeline */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Timeline · {detail.events.length} événement{detail.events.length > 1 ? 's' : ''}
              </h4>
              {detail.events.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
                  aucun événement enregistré
                </div>
              ) : (
                <ol className="space-y-3 border-l-2 border-white/10 pl-4">
                  {detail.events.map((e) => {
                    const style = EVENT_STYLE[e.eventType]
                    const hasMeta = Object.keys(e.metadata).length > 0
                    return (
                      <li key={e.id} className="relative">
                        <span className={cn('absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full', style.dot)} />
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-white">{style.label}</span>
                          <span className="shrink-0 text-[11px] text-white/40 tabular-nums">
                            {fmtRelative(e.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50">
                          {fmtDateTime(e.createdAt)} · source <span className="font-mono">{e.source}</span>
                        </div>
                        {hasMeta && (
                          <pre className="mt-1.5 overflow-x-auto rounded border border-white/5 bg-navy-800/50 p-2 font-mono text-[10px] text-white/55">
                            {JSON.stringify(e.metadata, null, 2)}
                          </pre>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          </div>
        )}

        {/* Footer actions */}
        {detail && cancellable && (
          <footer className="border-t border-white/10 bg-navy-900/80 px-6 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-white/45">
                Force-cancel libère le casier et trace l&apos;événement.
              </p>
              <ForceCancelButton id={detail.id} demo={demo} />
            </div>
          </footer>
        )}
      </aside>
    </>
  )
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-white/40">{label}</dt>
      <dd className={cn('truncate text-white/85', mono && 'font-mono text-[12px]')}>{value}</dd>
    </div>
  )
}
