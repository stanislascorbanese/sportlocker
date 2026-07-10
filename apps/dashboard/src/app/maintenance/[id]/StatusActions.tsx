'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { MaintenanceStatus } from '../../../lib/api'
import type { Lang } from '../../../lib/lang'
import { maintenanceStrings } from '../../../lib/i18n/maintenance'
import { changeTicketStatusAction } from '../_actions'

export function StatusActions({
  id,
  status,
  demo = false,
  lang,
}: {
  id: string
  status: MaintenanceStatus
  demo?: boolean
  lang: Lang
}) {
  const t = maintenanceStrings(lang)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const transition = (next: MaintenanceStatus) => {
    if (demo) {
      alert(t.demoBlocker)
      return
    }
    startTransition(() => {
      void (async () => {
        const res = await changeTicketStatusAction(id, next)
        if (!res.ok) {
          alert(res.error)
          return
        }
        router.refresh()
      })()
    })
  }

  const primary = 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 transition-colors duration-base hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20'
  const neutral = 'rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-600 transition-colors duration-base hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'open' && (
        <>
          <button type="button" disabled={isPending} onClick={() => transition('in_progress')} className={primary}>
            {t.takeOver}
          </button>
          <button type="button" disabled={isPending} onClick={() => transition('wontfix')} className={neutral} title={t.titleWontfix}>
            {t.statusWontfix}
          </button>
        </>
      )}
      {status === 'in_progress' && (
        <>
          <button type="button" disabled={isPending} onClick={() => transition('resolved')} className={primary}>
            {t.resolve}
          </button>
          <button type="button" disabled={isPending} onClick={() => transition('open')} className={neutral} title={t.titleSendBack}>
            {t.statusOpen}
          </button>
        </>
      )}
      {(status === 'resolved' || status === 'wontfix') && (
        <button type="button" disabled={isPending} onClick={() => transition('open')} className={neutral}>
          {t.reopen}
        </button>
      )}
    </div>
  )
}
