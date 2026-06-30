'use client'

import { ShieldOff, ShieldCheck, Trash2, Undo2 } from 'lucide-react'

import type { AdminUser, UserRole } from '../../lib/api'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { fmtRelative } from '../../lib/i18n/common'
import { usersStrings } from '../../lib/i18n/users'
import { useUserActions } from './useUserActions'

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

export function UserRow({
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
    <tr className={cn(
      'transition-colors duration-base',
      user.isBanned
        ? 'bg-rose-50/60 dark:bg-rose-500/[0.04]'
        : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]',
      hasGdprRequest && 'bg-amber-50/60 dark:bg-amber-500/[0.04]',
      isPending && 'opacity-50',
    )}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-navy-900 dark:text-white">{user.displayName ?? user.email}</span>
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
          <div className="mt-0.5 text-meta text-gray-500 dark:text-white/40">{user.email}</div>
        )}
        {user.bannedReason && (
          <div className="mt-1 text-meta italic text-rose-700 dark:text-rose-300/70">« {user.bannedReason} »</div>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          value={user.role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isPending || demo}
          className={cn(
            'cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide outline-none transition-colors duration-base',
            ROLE_STYLE[user.role],
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <option value="citizen">citizen</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
          {user.role === 'super_admin' && <option value="super_admin">super_admin</option>}
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={cn('font-mono text-sm tabular-nums', trustToneClass(user.trustScore))}>
          {user.trustScore}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-white/70">
        {user.totalReservations}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-white/60">
        {user.commune?.name ?? <span className="text-gray-400 dark:text-white/30">—</span>}
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums text-gray-600 dark:text-white/55">
        {fmtRelative(lang, user.lastActiveAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {user.isBanned ? (
            <button
              type="button"
              onClick={unban}
              disabled={isPending}
              title={t.titleUnban}
              className="rounded-md border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 transition-colors duration-base hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={ban}
              disabled={isPending}
              title={t.titleBan}
              className="rounded-md border border-gray-200 bg-gray-50 p-1.5 text-gray-500 transition-colors duration-base hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
            >
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          )}
          {hasGdprRequest ? (
            <button
              type="button"
              onClick={cancelGdpr}
              disabled={isPending}
              title={t.titleCancelGdpr}
              className="rounded-md border border-gray-200 bg-gray-50 p-1.5 text-amber-700 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-amber-300 dark:hover:bg-white/10"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={requestGdpr}
              disabled={isPending}
              title={t.titleRequestGdpr}
              className="rounded-md border border-gray-200 bg-gray-50 p-1.5 text-gray-500 transition-colors duration-base hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/50 dark:hover:border-amber-500/30 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
