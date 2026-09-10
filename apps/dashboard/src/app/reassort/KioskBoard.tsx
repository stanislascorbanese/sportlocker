import type { DistributorDetail } from '@sportlocker/types'

import { Card } from '../../components/ui'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { reassortStrings } from '../../lib/i18n/reassort'

/**
 * Un plan de borne : une tuile par casier, dans l'ordre des portes.
 *
 * La couleur porte le message avant le texte — vert « rien à faire », ambre
 * « à regarnir », rouge « en panne » — mais chaque tuile écrit aussi son état
 * en toutes lettres : on ne fait jamais reposer une consigne de travail sur la
 * seule couleur.
 */

type LockerState = DistributorDetail['lockers'][number]['state']

function toneFor(state: LockerState, empty: boolean) {
  if (state === 'fault') return 'fault' as const
  if (empty) return 'refill' as const
  if (state === 'idle') return 'ready' as const
  return 'busy' as const
}

const TILE: Record<'ready' | 'refill' | 'busy' | 'fault', string> = {
  ready:
    'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100',
  refill:
    'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100',
  busy: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60',
  fault:
    'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-100',
}

export function KioskBoard({ board, lang }: { board: DistributorDetail; lang: Lang }) {
  const t = reassortStrings(lang)
  const lockers = [...board.lockers].sort((a, b) => a.position - b.position)
  const refillCount = lockers.filter((l) => l.state === 'idle' && !l.currentItemId).length
  const offline = board.status !== 'online'

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl text-navy-900 dark:text-white">
          {board.name}{' '}
          <span className="font-sans text-meta font-normal text-gray-500 dark:text-white/45">
            {board.serialNumber}
          </span>
        </h3>
        <p
          className={cn(
            'text-sm font-semibold',
            refillCount > 0
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-emerald-700 dark:text-emerald-300',
          )}
        >
          {refillCount > 0 ? `${refillCount} ${t.refillCount}` : t.allGood}
        </p>
      </header>

      {offline ? (
        <p className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          {t.offlineWarning}
        </p>
      ) : null}

      <Card variant="elevated" padding="md">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lockers.map((locker) => {
            const empty = locker.state === 'idle' && !locker.currentItemId
            const tone = toneFor(locker.state, empty)
            const label =
              tone === 'fault'
                ? t.outOfOrder
                : tone === 'refill'
                  ? t.empty
                  : tone === 'busy'
                    ? t.outWithGuest
                    : (locker.itemType?.name ?? t.ready)

            return (
              <li
                key={locker.id}
                className={cn('rounded-card border-2 p-3 text-center', TILE[tone])}
              >
                <p className="text-eyebrow font-semibold uppercase tracking-wider opacity-70">
                  {t.locker}
                </p>
                <p className="font-display text-3xl font-bold tabular-nums">{locker.position}</p>
                <p className="mt-1 text-sm font-semibold leading-snug">{label}</p>
              </li>
            )
          })}
        </ul>
      </Card>
    </section>
  )
}
