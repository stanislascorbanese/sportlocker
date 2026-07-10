'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Lang } from '../../../lib/lang'
import { maintenanceStrings } from '../../../lib/i18n/maintenance'
import { addCommentAction } from '../_actions'

export function CommentForm({
  id,
  demo = false,
  lang,
}: {
  id: string
  demo?: boolean
  lang: Lang
}) {
  const t = maintenanceStrings(lang)
  const router = useRouter()
  const [value, setValue] = useState('')
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    const body = value.trim()
    if (body.length === 0) return
    if (demo) {
      alert(t.demoBlocker)
      return
    }
    startTransition(() => {
      void (async () => {
        const res = await addCommentAction(id, body)
        if (!res.ok) {
          alert(res.error)
          return
        }
        setValue('')
        router.refresh()
      })()
    })
  }

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={t.commentPlaceholder}
        rows={3}
        maxLength={2000}
        className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-gray-400 dark:border-white/10 dark:bg-navy-700 dark:text-white dark:placeholder:text-white/30"
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || value.trim().length === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
        >
          {t.commentSubmit}
        </button>
      </div>
    </div>
  )
}
