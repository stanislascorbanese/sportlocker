'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'

import { cn } from '../lib/cn'

export function RefreshButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = () => {
    startTransition(() => {
      router.refresh()
      setLastRefresh(new Date())
    })
  }

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={isPending}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-white/15 bg-navy-800 px-3 py-1.5 text-sm text-white/80 transition',
        'hover:border-white/30 hover:text-white disabled:opacity-50',
      )}
    >
      <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
      <span>{isPending ? 'Refresh…' : 'Refresh'}</span>
      {lastRefresh && !isPending && (
        <span className="font-mono text-[10px] text-white/40">
          {lastRefresh.toLocaleTimeString('fr-FR')}
        </span>
      )}
    </button>
  )
}
