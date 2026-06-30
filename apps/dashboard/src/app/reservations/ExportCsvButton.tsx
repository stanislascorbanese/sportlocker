'use client'

import { useTransition } from 'react'
import { Download } from 'lucide-react'

import type { ReservationExportFilters } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useLang } from '../../lib/lang-client'
import { reservationsStrings } from '../../lib/i18n/reservations'
import { exportReservationsCsvAction } from './_actions'

export function ExportCsvButton({ filters }: { filters: ReservationExportFilters }) {
  const lang = useLang()
  const t = reservationsStrings(lang)
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    startTransition(() => {
      void (async () => {
        const res = await exportReservationsCsvAction(filters)
        if (!res.ok) {
          alert(res.error)
          return
        }
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        if (res.source === 'demo') {
          setTimeout(() => alert(t.exportDemoToast), 100)
        }
      })()
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-white/15 bg-navy-800 px-3 py-1.5 text-sm text-white/80 transition',
        'hover:border-white/30 hover:text-white disabled:opacity-50',
      )}
    >
      <Download className={cn('h-4 w-4', pending && 'animate-pulse')} />
      <span>{pending ? t.exportBtnPending : t.exportBtnIdle}</span>
    </button>
  )
}
