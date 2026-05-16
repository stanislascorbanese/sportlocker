'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

export function ClickableRow({
  href,
  selected = false,
  children,
}: {
  href: string
  selected?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href, { scroll: false })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(href, { scroll: false })
        }
      }}
      className={cn(
        'cursor-pointer transition focus:outline-none',
        selected
          ? 'bg-emerald-500/[0.08] ring-1 ring-inset ring-emerald-400/30'
          : 'hover:bg-white/[0.03] focus-visible:bg-white/[0.04]',
      )}
    >
      {children}
    </tr>
  )
}
