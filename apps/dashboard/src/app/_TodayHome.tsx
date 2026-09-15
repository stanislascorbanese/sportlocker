import Link from 'next/link'
import { AlertTriangle, CalendarCheck, PackageOpen, ServerCrash, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  fetchDistributor,
  fetchDistributors,
  fetchLoans,
  fetchLoansDaily,
  type DailyPoint,
  type Distributor,
  type DistributorDetail,
  type LoanRow,
} from '../lib/api'
import { RefreshButton } from '../components/RefreshButton'
import { Sparkline } from '../components/Sparkline'
import { EmptyState, PageHeader } from '../components/ui'
import { cn } from '../lib/cn'
import { getLang } from '../lib/lang-server'
import { fmtRelative, fmtToday } from '../lib/i18n/common'
import { todayStrings } from '../lib/i18n/today'

/**
 * « Aujourd'hui » — l'écran d'ouverture du dashboard exploitant.
 *
 * Un exploitant — camping, hôtel, village vacances — n'exploite pas un parc :
 * il a une à quatre bornes et
 * trois minutes le matin. Cette page répond donc à une seule question — y a-t-il
 * quelque chose à faire ? — et se tait quand la réponse est non.
 *
 * Trois choses seulement peuvent réclamer une action : un casier vide, un
 * article qui n'est pas rentré, une borne qui ne répond plus. Elles n'apparaissent
 * que lorsqu'elles sont vraies. Le reste (état des bornes, courbe de la semaine)
 * est de l'information, pas du travail, et passe donc après.
 *
 * L'ancienne home affichait huit KPI de parc en permanence, dont la moitié ne
 * concernait pas un hébergeur. Elle reste servie aux super-admins.
 */

/** Un casier est « à regarnir » s'il est libre et qu'aucun article n'y est posé. */
function countToRefill(board: DistributorDetail): number {
  return board.lockers.filter((l) => l.state === 'idle' && !l.currentItemId).length
}

/**
 * Le seuil de l'écran « Non rendus ». En dessous de quatre heures, un vacancier
 * qui garde le ballon l'après-midi n'a rien fait d'anormal : le faire remonter
 * ici tous les matins finirait par rendre la page inutile.
 */
const SEUIL_HEURES = 4

type Snapshot = {
  distributors: Distributor[]
  boards: DistributorDetail[]
  unreturned: LoanRow[]
  outCount: number
  dailySeries: DailyPoint[]
  hadError: boolean
}

async function load(): Promise<Snapshot> {
  let hadError = false
  const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p
    } catch {
      hadError = true
      return fallback
    }
  }

  const distributors = await safe(fetchDistributors(), [] as Distributor[])

  const [boards, open, dailySeries] = await Promise.all([
    Promise.all(distributors.map((d) => safe(fetchDistributor(d.id), null))).then(
      (list) => list.filter((b): b is DistributorDetail => b !== null),
    ),
    safe(fetchLoans({ status: 'open', limit: 200 }), [] as LoanRow[]),
    safe(fetchLoansDaily(7), [] as DailyPoint[]),
  ])

  return {
    distributors,
    boards,
    // L'API calcule déjà la durée : les deux écrans sont ainsi d'accord sur
    // « depuis quand », sans dépendre de l'horloge du poste de l'accueil.
    unreturned: open.filter((l) => l.hoursOut >= SEUIL_HEURES),
    outCount: open.length,
    dailySeries,
    hadError,
  }
}

type Todo = {
  key: string
  icon: LucideIcon
  label: string
  sentence: string
  cta: string
  href: string
  tone: 'warn' | 'bad'
}

function TodoCard({ todo }: { todo: Todo }) {
  const Icon = todo.icon
  return (
    <Link
      href={todo.href}
      className={cn(
        'group flex items-start gap-4 rounded-card border p-4 transition-colors sm:p-5',
        todo.tone === 'bad'
          ? 'border-rose-300 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:hover:bg-rose-500/15'
          : 'border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:hover:bg-amber-500/15',
      )}
    >
      <div
        className={cn(
          'shrink-0 rounded-lg p-2.5',
          todo.tone === 'bad'
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
        )}
      >
        <Icon size={20} aria-hidden />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-eyebrow font-semibold uppercase text-gray-600 dark:text-white/50">
          {todo.label}
        </p>
        <p className="text-lg font-semibold leading-snug text-navy-900 dark:text-white">
          {todo.sentence}
        </p>
        <p className="text-sm font-medium text-gray-600 underline-offset-2 group-hover:underline dark:text-white/60">
          {todo.cta} →
        </p>
      </div>
    </Link>
  )
}

export async function TodayHome() {
  const lang = await getLang()
  const t = todayStrings(lang)
  const data = await load()

  const refillCount = data.boards.reduce((n, b) => n + countToRefill(b), 0)
  const unreturnedCount = data.unreturned.length
  const offline = data.distributors.filter((d) => d.status === 'offline')

  const todos: Todo[] = []
  if (offline.length > 0) {
    todos.push({
      key: 'offline',
      icon: ServerCrash,
      label: t.offlineLabel,
      sentence:
        offline.length === 1 ? t.offlineOne : `${offline.length} ${t.offlineMany}`,
      cta: t.offlineCta,
      href: '/distributors',
      tone: 'bad',
    })
  }
  if (unreturnedCount > 0) {
    todos.push({
      key: 'unreturned',
      icon: AlertTriangle,
      label: t.unreturnedLabel,
      sentence:
        unreturnedCount === 1 ? t.unreturnedOne : `${unreturnedCount} ${t.unreturnedMany}`,
      cta: t.unreturnedCta,
      href: '/non-rendus',
      tone: 'bad',
    })
  }
  if (refillCount > 0) {
    todos.push({
      key: 'refill',
      icon: PackageOpen,
      label: t.refillLabel,
      sentence: refillCount === 1 ? t.refillOne : `${refillCount} ${t.refillMany}`,
      cta: t.refillCta,
      href: '/reassort',
      tone: 'warn',
    })
  }

  const weekTotal = data.dailySeries.reduce((n, p) => n + p.count, 0)
  const todayPoint = data.dailySeries.at(-1)
  const loansToday = todayPoint?.count ?? 0

  // « Déposée » est un état normal du modèle saisonnier : SportLocker reprend
  // la borne à l'automne. Elle reste listée, en gris, et ne réclame rien.
  const STATUS_LABEL: Record<Distributor['status'], string> = {
    online: t.statusOnline,
    offline: t.statusOffline,
    maintenance: t.statusMaintenance,
    decommissioned: t.statusRemoved,
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={fmtToday(lang)}
        icon={<Sun size={20} aria-hidden />}
        actions={<RefreshButton />}
      />

      {data.hadError && (
        <p className="rounded-card border px-4 py-3 text-sm border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          {t.apiDown}
        </p>
      )}

      {/* À faire — la seule section qui demande une action. Absente si tout va bien. */}
      <section className="space-y-3">
        <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.todoTitle}
        </h2>
        {todos.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck size={22} aria-hidden />}
            title={t.nothingTitle}
            description={t.nothingHint}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todos.map((todo) => (
              <TodoCard key={todo.key} todo={todo} />
            ))}
          </div>
        )}
      </section>

      {/* Vos bornes — de l'information, pas du travail. */}
      <section className="space-y-3">
        <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.kiosksTitle}
        </h2>
        {data.distributors.length === 0 ? (
          <EmptyState title={t.kiosksEmpty} description={t.kiosksEmptyHint} />
        ) : (
          <ul className="divide-y overflow-hidden rounded-card border divide-gray-200 border-gray-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-navy-800">
            {data.distributors.map((d) => {
              const board = data.boards.find((b) => b.id === d.id)
              const stocked = board
                ? board.lockers.length - countToRefill(board)
                : d.lockerCount - d.idleLockers
              const total = board ? board.lockers.length : d.lockerCount
              return (
                <li key={d.id}>
                  <Link
                    href={`/distributors/${d.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        d.status === 'online' && 'bg-emerald-500',
                        d.status === 'offline' && 'bg-rose-500',
                        d.status === 'maintenance' && 'bg-amber-500',
                        d.status === 'decommissioned' && 'bg-gray-400 dark:bg-white/30',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-navy-900 dark:text-white">
                      {d.name}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        d.status === 'online' && 'text-emerald-700 dark:text-emerald-300',
                        d.status === 'offline' && 'text-rose-700 dark:text-rose-300',
                        d.status === 'maintenance' && 'text-amber-700 dark:text-amber-300',
                        d.status === 'decommissioned' && 'text-gray-500 dark:text-white/40',
                      )}
                    >
                      {STATUS_LABEL[d.status]}
                    </span>
                    <span className="text-sm tabular-nums text-gray-600 dark:text-white/60">
                      {stocked}/{total} {t.stocked}
                    </span>
                    <span className="text-meta text-gray-500 dark:text-white/40">
                      {d.lastSeenAt ? `${t.lastSeen} ${fmtRelative(lang, d.lastSeenAt)}` : t.neverSeen}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Cette semaine */}
      <section className="space-y-3">
        <h2 className="text-eyebrow font-semibold uppercase text-gray-500 dark:text-white/40">
          {t.weekTitle}
        </h2>
        <div className="rounded-card border p-4 sm:p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-navy-800">
          <dl className="mb-4 grid grid-cols-3 gap-4">
            <div>
              <dt className="text-meta text-gray-500 dark:text-white/40">{t.loansToday}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums text-navy-900 dark:text-white">
                {loansToday}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-gray-500 dark:text-white/40">{t.loansOut}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums text-navy-900 dark:text-white">
                {data.outCount}
              </dd>
            </div>
            <div>
              <dt className="text-meta text-gray-500 dark:text-white/40">{t.loansWeek}</dt>
              <dd className="font-display text-2xl font-bold tabular-nums text-navy-900 dark:text-white">
                {weekTotal}
              </dd>
            </div>
          </dl>
          <Sparkline points={data.dailySeries} width={520} lang={lang} />
          <p className="mt-2 text-meta text-gray-500 dark:text-white/40">{t.weekHint}</p>
        </div>
      </section>
    </div>
  )
}
