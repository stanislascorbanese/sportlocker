'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { AdminUser, UserRole } from '../../lib/api'
import type { Lang } from '../../lib/lang'
import { usersStrings } from '../../lib/i18n/users'
import {
  banUserAction,
  cancelGdprDeleteAction,
  requestGdprDeleteAction,
  setRoleAction,
  unbanUserAction,
} from './_actions'

/**
 * Hook partagé qui factorise les handlers d'actions admin sur un utilisateur :
 * ban/unban, set role, request/cancel GDPR delete. Utilisé par UserRow (table
 * desktop) et UserCard (mobile) sans duplication.
 *
 * Les confirmations passent par `window.prompt`/`window.confirm` côté client
 * (suffit pour le contexte admin SaaS, pas besoin de modale custom). Les
 * messages sont localisés via usersStrings.
 */
export function useUserActions(user: AdminUser, demo: boolean, lang: Lang) {
  const t = usersStrings(lang)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const guard = (): boolean => {
    if (demo) {
      alert(t.demoBlocker)
      return false
    }
    return true
  }

  const ban = () => {
    if (!guard()) return
    const reason = window.prompt(t.promptBanReason, '')
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
    if (!window.confirm(t.confirmUnban.replace('%s', user.email))) return
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
    if (!window.confirm(
      t.confirmRole.replace('%s', user.email).replace('%r', role),
    )) return
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
    if (!window.confirm(t.confirmGdprRequest.replace('%s', user.email))) return
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
    if (!window.confirm(t.confirmCancelGdpr.replace('%s', user.email))) return
    startTransition(() => {
      void (async () => {
        const r = await cancelGdprDeleteAction(user.id)
        if (!r.ok) alert(r.error)
        else router.refresh()
      })()
    })
  }

  return { isPending, ban, unban, setRole, requestGdpr, cancelGdpr }
}
