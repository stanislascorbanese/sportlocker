'use client'

import { ShieldOff, ShieldCheck, Trash2, Undo2 } from 'lucide-react'

import type { AdminUser, UserRole } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { fmtRelative } from '../../lib/i18n/common'
import { usersStrings } from '../../lib/i18n/users'
import { useUserActions } from './useUserActions'

/**
 * UserCard — variante mobile de UserRow.
 *
 * Pattern : sur < md la table 7 colonnes (min-w-[860px]) scrolle
 * horizontalement, pénible en astreinte. La card empile les infos
 * verticalement : identité en haut, badges role + état, métriques
 * (trust score, résa, commune, last active) en grille 2×2, actions
 * (ban/unban + GDPR) en bas avec labels visibles (au lieu d'icônes seules
 * comme dans le row dense).
 *
 * Réutilise `useUserActions` pour ne pas dupliquer la logique ban / set
 * role / GDPR avec UserRow.
 */
const ROLE_STYLE: Record<UserRole, string> = {
  citizen:
    'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
  operator:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  admin:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  super_admin:
    'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:border-fuchsia-500/30',
}

function trustToneClass(score: number): string {
  if (score >= 90) return 'text-emerald-700 dark:text-emerald-300'
  if (score >= 60) return 'text-amber-700 dark:text-amber-300'
  return 'text-rose-700 dark:text-rose-300'
}

export function UserCard({
  user,
  demo = false,
  lang,
}: {
  user: AdminUser
  demo?: boolean
  lang: Lang
}) {
  const t = usersStrings(lang)
  const { isPending, ban, unban, setRole, requestGdpr, cancelGdpr } = useUserActions(user, demo, lang)
  const hasGdprRequest = user.gdprDeleteRequestedAt !== null

  return (
    <div className={cn(
      'rounded-card border bg-white p-4 shadow-card transition-colors',
      user.isBanned
        ? 'border-rose-200 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/[0.04]'
        : hasGdprRequest
          ? 'border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/[0.04]'
          : 'border-gray-200 dark:border-white/10 dark:bg-navy-800 dark:shadow-none',
      isPending && 'opacity-60',
    )}>
      {/* Identité + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-navy-900 dark:text-white">
              {user.displayName ?? user.email}
            </span>
            {user.isBanned && (
              <span className="rounded-full border border-rose-300 bg-rose-100 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
                {t.badgeBanned}
              </span>
            )}
            {hasGdprRequest && (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
                {t.badgeGdpr}
              </span>
            )}
          </div>
          {user.displayName && (
            <div className="mt-0.5 truncate text-meta text-gray-500 dark:text-white/40">
              {user.email}
            </div>
          )}
        </div>
        <select
          value={user.role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isPending || demo}
          className={cn(
            'shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide outline-none transition-colors duration-base',
            ROLE_STYLE[user.role],
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <option value="citizen">citizen</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
          {user.role === 'super_admin' && <option value="super_admin">super_admin</option>}
        </select>
      </div>

      {/* Raison ban éventuelle */}
      {user.bannedReason && (
        <p className="mt-2 text-meta italic text-rose-700 dark:text-rose-300/70">
          « {user.bannedReason} »
        </p>
      )}

      {/* Métriques 2×2 */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-meta">
        <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t.colTrust}
          </div>
          <div className={cn('mt-0.5 font-mono text-sm tabular-nums', trustToneClass(user.trustScore))}>
            {user.trustScore}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t.colReservations}
          </div>
          <div className="mt-0.5 font-mono text-sm tabular-nums text-navy-900 dark:text-white/85">
            {user.totalReservations}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t.colCommune}
          </div>
          <div className="mt-0.5 truncate text-xs text-navy-900 dark:text-white/85">
            {user.commune?.name ?? <span className="text-gray-400 dark:text-white/30">—</span>}
          </div>
        </div>
        <div className="rounded-lg bg-gray-50 px-2 py-1.5 dark:bg-white/[0.03]">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
            {t.colLastActivity}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-navy-900 dark:text-white/85">
            {fmtRelative(lang, user.lastActiveAt)}
          </div>
        </div>
      </div>

      {/* Actions — labels visibles (vs icon-only en table) */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
        {user.isBanned ? (
          <button
            type="button"
            onClick={unban}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-meta font-medium text-emerald-700 transition-colors duration-base hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t.titleUnban}
          </button>
        ) : (
          <button
            type="button"
            onClick={ban}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-meta font-medium text-gray-600 transition-colors duration-base hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/65 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
          >
            <ShieldOff className="h-3.5 w-3.5" />
            {t.titleBan}
          </button>
        )}
        {hasGdprRequest ? (
          <button
            type="button"
            onClick={cancelGdpr}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-meta font-medium text-amber-700 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-300 dark:hover:bg-white/10"
          >
            <Undo2 className="h-3.5 w-3.5" />
            {t.titleCancelGdpr}
          </button>
        ) : (
          <button
            type="button"
            onClick={requestGdpr}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-meta font-medium text-gray-600 transition-colors duration-base hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/65 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t.titleRequestGdpr}
          </button>
        )}
      </div>
    </div>
  )
}
