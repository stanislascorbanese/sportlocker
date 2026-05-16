'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Map,
  Server,
  CalendarClock,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '../lib/cn'

type Item = { href: string; label: string; icon: LucideIcon }

const ITEMS: Item[] = [
  { href: '/',             label: 'Accueil',       icon: Home },
  { href: '/map',          label: 'Carte',         icon: Map },
  { href: '/distributors', label: 'Distributeurs', icon: Server },
  { href: '/reservations', label: 'Réservations',  icon: CalendarClock },
  { href: '/maintenance',  label: 'Maintenance',   icon: Wrench },
]

export function Sidebar() {
  const pathname = usePathname() ?? '/'

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-white/10 bg-navy-900/80 backdrop-blur">
      <div className="px-5 py-5">
        <Link href="/" className="font-display text-lg tracking-tight">
          SportLocker
          <span className="ml-1 text-emerald-400">· ops</span>
        </Link>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/30">Console opérateur</p>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === '/'
            ? pathname === '/'
            : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                active
                  ? 'bg-emerald-500/10 text-white'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white',
              )}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-400" />
              )}
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-emerald-300' : 'text-white/50')} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-5 py-4 text-[10px] text-white/30">
        v0.1 · build {process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? 'dev'}
      </div>
    </aside>
  )
}
