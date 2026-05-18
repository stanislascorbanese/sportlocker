'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import { Sidebar } from './Sidebar'

const PUBLIC_PATHS = ['/login', '/accept-invite']

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (isPublic) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
    </div>
  )
}
