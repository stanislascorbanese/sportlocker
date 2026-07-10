'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { InviteStatus } from '../../../lib/api'
import type { Lang } from '../../../lib/lang'
import { invitesStrings } from '../../../lib/i18n/invites'
import { resendInviteAction, revokeInviteAction } from './_actions'

export function InviteRowActions({
  token,
  email,
  status,
  demo = false,
  lang,
}: {
  token: string
  email: string
  status: InviteStatus
  demo?: boolean
  lang: Lang
}) {
  const t = invitesStrings(lang)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Une invite acceptée n'est plus actionnable.
  if (status === 'accepted') {
    return <span className="text-meta text-gray-400 dark:text-white/30">—</span>
  }

  const resend = () => {
    if (demo) { alert(t.demoBlocker); return }
    if (!window.confirm(t.resendConfirm.replace('%s', email))) return
    startTransition(() => {
      void (async () => {
        const res = await resendInviteAction(token)
        if (!res.ok) { alert(res.error); return }
        window.prompt(t.resentTitle, res.invite.inviteUrl)
        router.refresh()
      })()
    })
  }

  const revoke = () => {
    if (demo) { alert(t.demoBlocker); return }
    if (!window.confirm(t.revokeConfirm.replace('%s', email))) return
    startTransition(() => {
      void (async () => {
        const res = await revokeInviteAction(token)
        if (!res.ok) { alert(res.error); return }
        router.refresh()
      })()
    })
  }

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={resend}
        disabled={isPending}
        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-meta text-gray-600 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
      >
        {t.resend}
      </button>
      <button
        type="button"
        onClick={revoke}
        disabled={isPending}
        className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-meta font-medium text-rose-700 transition-colors duration-base hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
      >
        {t.revoke}
      </button>
    </div>
  )
}
