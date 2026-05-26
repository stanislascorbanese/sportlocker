'use client'

import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ChevronUp, History } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { fetchMyReservations, type ReservationHistoryItem } from '../../lib/api'
import { useI18n, useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages'

/**
 * Section "Mes emprunts" affichée sur /profile.
 *
 * Liste les 50 dernières réservations du user (GET /v1/reservations/me).
 * Statuts "vivants" (scheduled/pending/active/overdue) cliquables vers
 * /reservations/<id>. Statuts terminaux (returned/cancelled/expired)
 * non-cliquables — rien d'utile à faire derrière.
 *
 * **Limite par défaut** : 5 emprunts. Au-delà, un bouton "Voir tout (N)"
 * révèle le reste. Évite d'avoir une scroll de 50 lignes sur /profile pour
 * les users prolifiques tout en gardant l'historique accessible à 1 tap.
 */
const VISIBLE_BY_DEFAULT = 5

type StatusMeta = { tone: BadgeTone; live: boolean; labelKey: MessageKey }

const STATUS_META: Record<ReservationHistoryItem['status'], StatusMeta> = {
  scheduled: { tone: 'info',    live: true,  labelKey: 'reservation.status_long.scheduled' },
  pending:   { tone: 'warning', live: true,  labelKey: 'reservation.status_long.pending' },
  active:    { tone: 'success', live: true,  labelKey: 'reservation.status_long.active' },
  overdue:   { tone: 'danger',  live: true,  labelKey: 'reservation.status_long.overdue' },
  returned:  { tone: 'neutral', live: false, labelKey: 'reservation.status_long.returned' },
  cancelled: { tone: 'neutral', live: false, labelKey: 'reservation.status_long.cancelled' },
  expired:   { tone: 'neutral', live: false, labelKey: 'reservation.status_long.expired' },
}

export function ReservationsHistory() {
  const t = useT()
  const { locale } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-reservations'],
    queryFn: fetchMyReservations,
    staleTime: 30 * 1000,
  })

  const total = data?.length ?? 0
  const canCollapse = total > VISIBLE_BY_DEFAULT
  const visible = !canCollapse || expanded ? data ?? [] : (data ?? []).slice(0, VISIBLE_BY_DEFAULT)

  return (
    <section className="rounded-card border p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
      <header className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-gray-500 dark:text-white/60" aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold text-navy-900/80 dark:text-white/80">
          {t('profile.history.title')}
        </h2>
      </header>

      {isLoading && (
        <ul
          className="-mx-2 divide-y divide-gray-200 dark:divide-white/5"
          aria-label={t('profile.history.loading')}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton width="60%" height={14} />
                <Skeleton width="85%" height={11} />
              </div>
              <Skeleton width={56} height={18} rounded="full" />
            </li>
          ))}
        </ul>
      )}
      {isError && (
        <div className="space-y-2 text-sm">
          <p className="text-rose-700 dark:text-rose-300">{t('profile.history.error')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300"
          >
            {t('profile.history.retry')}
          </button>
        </div>
      )}
      {data && data.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-white/50">{t('profile.history.empty')}</p>
      )}
      {data && data.length > 0 && (
        <>
          <ul className="-mx-2 divide-y divide-gray-200 dark:divide-white/5">
            {visible.map((item) => (
              <ReservationRow key={item.id} item={item} locale={locale} />
            ))}
          </ul>
          {canCollapse && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border py-2 text-meta font-medium transition-colors duration-base ease-out-soft border-gray-200 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50 dark:border-white/10 dark:bg-white/5 dark:text-emerald-300 dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10"
            >
              {expanded ? (
                <>
                  {t('profile.history.show_less')}
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              ) : (
                <>
                  {t('profile.history.show_all', { count: total })}
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </>
              )}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function ReservationRow({
  item,
  locale,
}: {
  item: ReservationHistoryItem
  locale: 'fr' | 'en'
}) {
  const t = useT()
  const meta = STATUS_META[item.status]
  const range = formatRange(item, locale)

  const inner = (
    <div className="flex items-center gap-3 px-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-navy-900 dark:text-white">
          {item.item.typeName}
        </p>
        <p className="truncate text-meta text-gray-600 dark:text-white/60">
          {item.distributor.name} · {range}
        </p>
      </div>
      <Badge tone={meta.tone} size="xs" className="shrink-0">
        {t(meta.labelKey)}
      </Badge>
      {meta.live && (
        <ChevronRight
          className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/40"
          aria-hidden="true"
        />
      )}
    </div>
  )

  if (meta.live) {
    return (
      <li>
        <Link
          href={`/reservations/${item.id}`}
          className="block transition-colors duration-base hover:bg-white dark:hover:bg-white/5"
          aria-label={t('profile.history.aria', {
            item: item.item.typeName,
            distributor: item.distributor.name,
          })}
        >
          {inner}
        </Link>
      </li>
    )
  }
  return <li>{inner}</li>
}

function formatRange(item: ReservationHistoryItem, locale: 'fr' | 'en'): string {
  const fmtDate = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
  const fmtTime = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    hour: '2-digit', minute: '2-digit',
  })

  const formatRange = (start: Date, end: Date) => {
    const sameDay =
      start.getFullYear() === end.getFullYear()
      && start.getMonth() === end.getMonth()
      && start.getDate() === end.getDate()
    if (sameDay) return `${fmtDate.format(start)} – ${fmtTime.format(end)}`
    return `${fmtDate.format(start)} → ${fmtDate.format(end)}`
  }

  if (item.slotStartAt && item.slotEndAt) {
    return formatRange(new Date(item.slotStartAt), new Date(item.slotEndAt))
  }
  if (item.openedAt && item.dueAt) {
    return formatRange(new Date(item.openedAt), new Date(item.dueAt))
  }
  return fmtDate.format(new Date(item.createdAt))
}
