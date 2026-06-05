'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban } from 'lucide-react'

import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { reservationsStrings } from '../../lib/i18n/reservations'
import { forceCancelReservationAction } from './_actions'

export function ForceCancelButton({
  id,
  disabled = false,
  demo = false,
  lang,
}: {
  id: string
  disabled?: boolean
  demo?: boolean
  lang: Lang
}) {
  const t = reservationsStrings(lang)
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    if (demo) {
      alert(t.fcDemoBlocker)
      return
    }
    const reason = window.prompt(t.fcPrompt, '')
    if (!reason) return

    startTransition(() => {
      void (async () => {
        const res = await forceCancelReservationAction(id, reason)
        if (!res.ok) {
          alert(res.error)
          return
        }
        router.refresh()
      })()
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || pending}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm font-medium text-rose-300 transition',
        'hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      <Ban className="h-3.5 w-3.5" />
      {pending ? t.fcBtnPending : t.fcBtnIdle}
    </button>
  )
}
