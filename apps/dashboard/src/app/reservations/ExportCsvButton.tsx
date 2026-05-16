'use client'

import { useTransition } from 'react'
import { Download } from 'lucide-react'

import type { ReservationExportFilters } from '../../lib/api'
import { cn } from '../../lib/cn'
import { exportReservationsCsvAction } from './_actions'

export function ExportCsvButton({ filters }: { filters: ReservationExportFilters }) {
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
          // Petit indicateur — pas de toast lib donc on garde simple
          setTimeout(() => alert('Export téléchargé (mode démo — données fictives).'), 100)
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
      <span>{pending ? 'Export…' : 'Exporter CSV'}</span>
    </button>
  )
}
