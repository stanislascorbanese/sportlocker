'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '../lib/cn'

const ITEMS = [
  { href: '/',             label: 'Accueil' },
  { href: '/map',          label: 'Carte' },
  { href: '/distributors', label: 'Distributeurs' },
  { href: '/reservations', label: 'Réservations' },
  { href: '/maintenance',  label: 'Maintenance' },
] as const

export function NavLinks() {
  const pathname = usePathname() ?? '/'

  return (
    <nav className="flex gap-6 text-sm">
      {ITEMS.map((item) => {
        const active = item.href === '/'
          ? pathname === '/'
          : pathname.startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'transition',
              active ? 'font-medium text-white' : 'text-white/60 hover:text-white',
            )}
          >
            {item.label}
            {active && (
              <span className="mt-0.5 block h-0.5 rounded-full bg-emerald-400" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
