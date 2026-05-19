import Link from 'next/link'

import { USER_ROLES, fetchUsers, type AdminUser, type UserRole } from '../../lib/api'
import { DEMO_ADMIN_USERS } from '../../lib/demo-data'
import { RefreshButton } from '../../components/RefreshButton'
import { UserRow } from './UserRow'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Utilisateurs · SportLocker ops' }

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

  let users = useDemo ? DEMO_ADMIN_USERS : realUsers
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
            <h2 className="font-display text-2xl sm:text-3xl">Utilisateurs</h2>
            {useDemo && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                Démo
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-white/55">
            {counts.total} affiché{counts.total > 1 ? 's' : ''}
            {' · '}
            <span className="text-rose-300">{counts.banned} banni{counts.banned > 1 ? 's' : ''}</span>
            {' · '}
            <span className="text-amber-300">{counts.gdpr} RGPD en attente</span>
            {' · '}
            {counts.operators} staff
            {useDemo && ' · données fictives'}
          </p>
        </div>
        <RefreshButton />
      </header>

      <form className="grid grid-cols-1 gap-3 rounded-xl border border-white/10 bg-navy-800 p-4 sm:flex sm:flex-wrap sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="q" className="text-[11px] uppercase tracking-wide text-white/50">Recherche</label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="email ou nom…"
            defaultValue={q ?? ''}
            className="min-w-[220px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white placeholder:text-white/30"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="role" className="text-[11px] uppercase tracking-wide text-white/50">Rôle</label>
          <select
            id="role"
            name="role"
            defaultValue={role ?? ''}
            className="min-w-[120px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Tous</option>
            {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="banned" className="text-[11px] uppercase tracking-wide text-white/50">État</label>
          <select
            id="banned"
            name="banned"
            defaultValue={banned ?? ''}
            className="min-w-[120px] rounded-lg border border-white/10 bg-navy-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Tous</option>
            <option value="false">actif</option>
            <option value="true">banni</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
        >
          Filtrer
        </button>
        {(role || banned || q) && (
          <Link href="/users" className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline">
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

      {users.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-navy-800 p-8 text-center text-sm text-white/55">
          Aucun utilisateur pour ces filtres.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-navy-800">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-navy-700/50 text-left text-xs uppercase tracking-wide text-white/55">
              <tr>
                <th className="px-4 py-3 font-medium">Utilisateur</th>
                <th className="px-4 py-3 font-medium">Rôle</th>
                <th className="px-4 py-3 font-medium">Trust</th>
                <th className="px-4 py-3 font-medium text-right">Résa.</th>
                <th className="px-4 py-3 font-medium">Commune</th>
                <th className="px-4 py-3 font-medium">Dernière activité</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => <UserRow key={u.id} user={u} demo={useDemo} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
