'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Lang } from '../../../lib/lang'
import { maintenanceStrings } from '../../../lib/i18n/maintenance'
import { assignTicketAction } from '../_actions'

export type AssignableAdmin = { id: string; email: string; displayName: string | null }

export function AssigneeSelector({
  id,
  currentAssigneeId,
  admins,
  demo = false,
  lang,
}: {
  id: string
  currentAssigneeId: string | null
  admins: AssignableAdmin[]
  demo?: boolean
  lang: Lang
}) {
  const t = maintenanceStrings(lang)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const onChange = (value: string) => {
    if (demo) {
      alert(t.demoBlocker)
      return
    }
    const next = value === '' ? null : value
    if (next === currentAssigneeId) return
    startTransition(() => {
      void (async () => {
        const res = await assignTicketAction(id, next)
        if (!res.ok) {
          alert(res.error)
          return
        }
        router.refresh()
      })()
    })
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-eyebrow text-gray-500 dark:text-white/50">{t.assignLabel}</span>
      <select
        value={currentAssigneeId ?? ''}
        disabled={isPending}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[200px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 disabled:opacity-50 dark:border-white/10 dark:bg-navy-700 dark:text-white"
      >
        <option value="">{t.unassigned} {t.assignSelf}</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName ? `${a.displayName} · ${a.email}` : a.email}
          </option>
        ))}
      </select>
    </label>
  )
}
