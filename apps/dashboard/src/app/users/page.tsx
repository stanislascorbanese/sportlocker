import Link from 'next/link'

import { USER_ROLES, fetchUsers, type AdminUser, type UserRole } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { usersStrings, userRoleLabel } from '../../lib/i18n/users'
import { invitesStrings } from '../../lib/i18n/invites'
import { makeMetadata } from '../../lib/i18n/metadata'
import { UserCard } from './UserCard'
import { UserRow } from './UserRow'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => usersStrings(lang).metaTitle)

type SearchParams = {
  role?: string
  banned?: string
  q?: string
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const lang = await getLang()
  const t = usersStrings(lang)
  const c = commonStrings(lang)
  const inv = invitesStrings(lang)

  const role = (USER_ROLES as readonly string[]).includes(params.role ?? '')
    ? (params.role as UserRole)
    : undefined
  const banned: 'true' | 'false' | undefined =
    params.banned === 'true' || params.banned === 'false' ? params.banned : undefined
  const q = params.q?.trim() ? params.q.trim() : undefined

  const filters: Parameters<typeof fetchUsers>[0] = {}
  if (role) filters.role = role
  if (banned) filters.banned = banned
  if (q) filters.q = q

  let realUsers: AdminUser[] = []
  let fetchError: string | null = null

  try {
    realUsers = await fetchUsers(filters)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const noFilter = !role && !banned && !q
  const useDemo = fetchError !== null || (realUsers.length === 0 && noFilter)

  // Lazy-load demo-data uniquement en fallback (code-splitting serveur).
  let users = useDemo
    ? (await import('../../lib/demo-data')).DEMO_ADMIN_USERS
    : realUsers
  if (useDemo) {
    if (role) users = users.filter((u) => u.role === role)
    if (banned === 'true') users = users.filter((u) => u.isBanned)
    if (banned === 'false') users = users.filter((u) => !u.isBanned)
    if (q) {
      const needle = q.toLowerCase()
      users = users.filter((u) =>
        u.email.toLowerCase().includes(needle)
        || (u.displayName?.toLowerCase().includes(needle) ?? false),
      )
    }
  }

  const counts = {
    total: users.length,
    banned: users.filter((u) => u.isBanned).length,
    gdpr: users.filter((u) => u.gdprDeleteRequestedAt && !u.gdprDeletedAt).length,
    operators: users.filter((u) => u.role === 'operator' || u.role === 'admin').length,
  }

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
            {counts.total} {counts.total > 1 ? t.displayedMany : t.displayed1}
            {' · '}
            <span className="text-rose-700 dark:text-rose-300">
              {counts.banned} {counts.banned > 1 ? t.bannedMany : t.banned1}
            </span>
            {' · '}
            <span className="text-amber-700 dark:text-amber-300">{counts.gdpr} {t.gdprPending}</span>
            {' · '}
            {counts.operators} {t.staff}
            {useDemo && ` · ${c.demoFootnote}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/users/invites"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
          >
            {inv.linkLabel}
          </Link>
          <RefreshButton />
        </div>
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-card border bg-white p-4 shadow-card sm:flex sm:flex-wrap sm:items-end dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="q" className="text-eyebrow text-gray-500 dark:text-white/50">{c.search}</label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder={t.searchPlaceholder}
            defaultValue={q ?? ''}
            className="min-w-[220px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 placeholder:text-gray-400 dark:border-white/10 dark:bg-navy-700 dark:text-white dark:placeholder:text-white/30"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="role" className="text-eyebrow text-gray-500 dark:text-white/50">{t.filterRole}</label>
          <select
            id="role"
            name="role"
            defaultValue={role ?? ''}
            className="min-w-[120px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            {USER_ROLES.map((r) => <option key={r} value={r}>{userRoleLabel(lang, r)}</option>)}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="banned" className="text-eyebrow text-gray-500 dark:text-white/50">{t.filterState}</label>
          <select
            id="banned"
            name="banned"
            defaultValue={banned ?? ''}
            className="min-w-[120px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
          >
            <option value="">{c.all}</option>
            <option value="false">{t.stateActive}</option>
            <option value="true">{t.stateBanned}</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
        >
          {c.filter}
        </button>
        {(role || banned || q) && (
          <Link
            href="/users"
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

      {users.length === 0 ? (
        <div className="rounded-card border bg-white p-8 text-center text-sm text-gray-600 shadow-card dark:border-white/10 dark:bg-navy-800 dark:text-white/55 dark:shadow-none">
          {t.emptyForFilters}
        </div>
      ) : (
        <>
        {/* Mobile : cards (table min-w-[860px] H scroll pénible en astreinte) */}
        <div className="space-y-3 md:hidden">
          {users.map((u) => <UserCard key={u.id} user={u} demo={useDemo} lang={lang} />)}
        </div>

        {/* Desktop : tableau dense classique */}
        <div className="hidden overflow-x-auto rounded-card border bg-white shadow-card md:block dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50 text-left text-eyebrow text-gray-600 dark:bg-navy-700/50 dark:text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">{t.colUser}</th>
                <th className="px-4 py-3 font-medium">{t.colRole}</th>
                <th className="px-4 py-3 font-medium">{t.colTrust}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colReservations}</th>
                <th className="px-4 py-3 font-medium">{t.colCommune}</th>
                <th className="px-4 py-3 font-medium">{t.colLastActivity}</th>
                <th className="px-4 py-3 font-medium text-right">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-white/5">
              {users.map((u) => <UserRow key={u.id} user={u} demo={useDemo} lang={lang} />)}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}
