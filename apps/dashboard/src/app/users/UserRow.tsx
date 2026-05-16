'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldOff, ShieldCheck, Trash2, Undo2 } from 'lucide-react'

import type { AdminUser, UserRole } from '../../lib/api'
import { cn } from '../../lib/cn'
import {
  banUserAction,
  cancelGdprDeleteAction,
  requestGdprDeleteAction,
  setRoleAction,
  unbanUserAction,
} from './_actions'

const ROLE_STYLE: Record<UserRole, string> = {
  citizen:  'bg-sky-500/10 text-sky-300 border-sky-500/30',
  operator: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  admin:    'bg-amber-500/10 text-amber-300 border-amber-500/30',
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return `il y a ${diffSec}s`
  if (diffSec < 3600) return `il y a ${Math.round(diffSec / 60)}min`
  if (diffSec < 86_400) return `il y a ${Math.round(diffSec / 3600)}h`
  return `il y a ${Math.round(diffSec / 86_400)}j`
}

function trustToneClass(score: number): string {
  if (score >= 90) return 'text-emerald-300'
  if (score >= 60) return 'text-amber-300'
  return 'text-rose-300'
}

export function UserRow({ user, demo = false }: { user: AdminUser; demo?: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const guard = () => {
    if (demo) {
      alert('Mode démo — branchez un token admin valide pour modifier les utilisateurs.')
      return false
    }
    return true
  }

  const ban = () => {
    if (!guard()) return
    const reason = window.prompt('Raison du bannissement (min. 4 caractères) :', '')
    if (!reason) return
    startTransition(() => {
      void (async () => {
        const r = await banUserAction(user.id, reason)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  const unban = () => {
    if (!guard()) return
    if (!window.confirm(`Débannir ${user.email} ?`)) return
    startTransition(() => {
      void (async () => {
        const r = await unbanUserAction(user.id)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  const setRole = (role: UserRole) => {
    if (!guard()) return
    if (role === user.role) return
    if (!window.confirm(`Passer ${user.email} en rôle "${role}" ?`)) return
    startTransition(() => {
      void (async () => {
        const r = await setRoleAction(user.id, role)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  const requestGdpr = () => {
    if (!guard()) return
    if (!window.confirm(
      `Demander la suppression RGPD de ${user.email} ?\n\n` +
      `Les données seront anonymisées automatiquement après 30 jours. ` +
      `Cette demande peut être annulée tant que la suppression effective n'a pas eu lieu.`,
    )) return
    startTransition(() => {
      void (async () => {
        const r = await requestGdprDeleteAction(user.id)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  const cancelGdpr = () => {
    if (!guard()) return
    if (!window.confirm(`Annuler la demande RGPD pour ${user.email} ?`)) return
    startTransition(() => {
      void (async () => {
        const r = await cancelGdprDeleteAction(user.id)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  const hasGdprRequest = user.gdprDeleteRequestedAt !== null

  return (
    <tr className={cn(
      'transition',
      user.isBanned ? 'bg-rose-500/[0.04]' : 'hover:bg-white/[0.02]',
      hasGdprRequest && 'bg-amber-500/[0.04]',
      isPending && 'opacity-50',
    )}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-white">{user.displayName ?? user.email}</span>
          {user.isBanned && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-rose-200">
              banni
            </span>
          )}
          {hasGdprRequest && (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wider text-amber-200">
              RGPD
            </span>
          )}
        </div>
        {user.displayName && (
          <div className="mt-0.5 text-[11px] text-white/40">{user.email}</div>
        )}
        {user.bannedReason && (
          <div className="mt-1 text-[11px] text-rose-300/70 italic">« {user.bannedReason} »</div>
        )}
      </td>
      <td className="px-4 py-3">
        <select
          value={user.role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isPending || demo}
          className={cn(
            'cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide outline-none transition',
            ROLE_STYLE[user.role],
            'disabled:cursor-not-allowed disabled:opacity-60',
          )}
        >
          <option value="citizen">citizen</option>
          <option value="operator">operator</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <span className={cn('font-mono text-sm tabular-nums', trustToneClass(user.trustScore))}>
          {user.trustScore}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-white/70">
        {user.totalReservations}
      </td>
      <td className="px-4 py-3 text-white/60">
        {user.commune?.name ?? <span className="text-white/30">—</span>}
      </td>
      <td className="px-4 py-3 text-[12px] text-white/55 tabular-nums">
        {fmtRelative(user.lastActiveAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {user.isBanned ? (
            <button
              type="button"
              onClick={unban}
              disabled={isPending}
              title="Débannir"
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={ban}
              disabled={isPending}
              title="Bannir"
              className="rounded-md border border-white/10 bg-white/5 p-1.5 text-white/50 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
            >
              <ShieldOff className="h-3.5 w-3.5" />
            </button>
          )}
          {hasGdprRequest ? (
            <button
              type="button"
              onClick={cancelGdpr}
              disabled={isPending}
              title="Annuler la demande RGPD"
              className="rounded-md border border-white/10 bg-white/5 p-1.5 text-amber-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={requestGdpr}
              disabled={isPending}
              title="Déclencher suppression RGPD"
              className="rounded-md border border-white/10 bg-white/5 p-1.5 text-white/50 transition hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-300 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
