import Link from 'next/link'
import { X } from 'lucide-react'

import type { LockerEventType, ReservationDetail, ReservationStatus } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { commonStrings, fmtDateTime, fmtRelative } from '../../lib/i18n/common'
import { reservationStatusLabel, reservationsStrings } from '../../lib/i18n/reservations'
import { lockerEventLabel } from '../../lib/i18n/audit'
import { ForceCancelButton } from './ForceCancelButton'

const STATUS_STYLE: Record<ReservationStatus, string> = {
  scheduled: 'bg-violet-500/10 border-violet-500/30 text-violet-300',
  pending:   'bg-sky-500/10 border-sky-500/30 text-sky-300',
  active:    'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
  returned:  'bg-zinc-500/10 border-zinc-500/30 text-zinc-300',
  overdue:   'bg-rose-500/10 border-rose-500/30 text-rose-300',
  cancelled: 'bg-zinc-700/30 border-zinc-700/50 text-zinc-400',
  expired:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
}

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

export function ReservationDrawer({
  detail,
  closeHref,
  demo = false,
  error,
  lang,
}: {
  detail: ReservationDetail | null
  closeHref: string
  demo?: boolean
  error?: string | undefined
  lang: Lang
}) {
  const t = reservationsStrings(lang)
  const c = commonStrings(lang)
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
        aria-label={t.drawerCloseBackdropAria}
      />

      {/* Panneau */}
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-navy-900 shadow-2xl"
        role="dialog"
        aria-label={t.drawerSrLabel}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
              {t.drawerReservation}
            </h3>
            {detail ? (
              <>
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide',
                    STATUS_STYLE[detail.status],
                  )}>
                    {reservationStatusLabel(lang, detail.status)}
                  </span>
                  {demo && (
                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                      {c.demo}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-white/40">{detail.id}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-white/60">{error ?? t.drawerLoading}</p>
            )}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            className="rounded-lg border border-white/10 p-1.5 text-white/60 transition hover:border-white/30 hover:text-white"
            aria-label={t.drawerCloseAria}
          >
            <X className="h-4 w-4" />
          </Link>
        </header>

        {!detail ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-white/50">
            {error ?? t.drawerLoading}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Section Utilisateur */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t.drawerUser}</h4>
              <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                <div className="text-sm text-white">{detail.user.displayName ?? detail.user.email}</div>
                {detail.user.displayName && (
                  <div className="mt-0.5 text-[12px] text-white/50">{detail.user.email}</div>
                )}
                <Link
                  href={`/users?q=${encodeURIComponent(detail.user.email)}`}
                  className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200"
                >
                  {t.drawerSeeUserProfile}
                </Link>
              </div>
            </section>

            {/* Section Distributeur + Item */}
            <section className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t.drawerDistributor}</h4>
                <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                  <div className="text-sm text-white">{detail.distributor.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-white/40">{detail.distributor.serialNumber}</div>
                  <Link
                    href={`/distributors/${detail.distributor.id}/edit`}
                    className="mt-2 inline-block text-[11px] text-emerald-300 hover:text-emerald-200"
                  >
                    {t.drawerSeeSheet}
                  </Link>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t.drawerItem}</h4>
                <div className="rounded-lg border border-white/10 bg-navy-800 p-3">
                  <div className="text-sm text-white">{detail.item.typeName}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-white/40 truncate">{detail.item.id}</div>
                </div>
              </div>
            </section>

            {/* Section Métadonnées */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t.drawerLifecycle}</h4>
              <dl className="rounded-lg border border-white/10 bg-navy-800 divide-y divide-white/5 text-sm">
                <MetaRow label={t.drawerCreated} value={fmtDateTime(lang, detail.createdAt)} />
                <MetaRow label={t.drawerExpiresQr} value={fmtDateTime(lang, detail.expiresAt)} />
                <MetaRow label={t.drawerOpened} value={fmtDateTime(lang, detail.openedAt)} />
                <MetaRow label={t.drawerDueAt} value={fmtDateTime(lang, detail.dueAt)} />
                <MetaRow label={t.drawerReturned} value={fmtDateTime(lang, detail.returnedAt)} />
                <MetaRow label={t.drawerExtensions} value={detail.extensionCount > 0 ? `×${detail.extensionCount}` : '—'} />
                {detail.cancellationReason && (
                  <MetaRow label={t.drawerCancellationReason} value={detail.cancellationReason} mono />
                )}
                <MetaRow label={t.drawerQrJti} value={detail.qrJti} mono />
              </dl>
            </section>

            {/* Section Timeline */}
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                {t.drawerTimeline} · {detail.events.length} {detail.events.length > 1 ? t.drawerEventMany : t.drawerEvent1}
              </h4>
              {detail.events.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-white/40">
                  {t.drawerNoEvents}
                </div>
              ) : (
                <ol className="space-y-3 border-l-2 border-white/10 pl-4">
                  {detail.events.map((e) => {
                    const hasMeta = Object.keys(e.metadata).length > 0
                    return (
                      <li key={e.id} className="relative">
                        <span className={cn('absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full', EVENT_DOT[e.eventType])} />
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-white">{lockerEventLabel(lang, e.eventType)}</span>
                          <span className="shrink-0 text-[11px] text-white/40 tabular-nums">
                            {fmtRelative(lang, e.createdAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50">
                          {fmtDateTime(lang, e.createdAt)} · {t.drawerSourcePrefix} <span className="font-mono">{e.source}</span>
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
              <p className="text-[11px] text-white/45">{t.drawerForceCancelHint}</p>
              <ForceCancelButton id={detail.id} demo={demo} lang={lang} />
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
