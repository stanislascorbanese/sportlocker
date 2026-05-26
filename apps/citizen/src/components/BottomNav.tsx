'use client'

import { useQuery } from '@tanstack/react-query'
import { Home, type LucideIcon, QrCode, User } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { fetchActiveReservation } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { cn } from '../lib/cn'

type Tab = {
  href: string
  label: string
  icon: LucideIcon
  isActive: (pathname: string) => boolean
}

/**
 * Navigation bottom permanente — 3 tabs adaptatifs :
 *   - Accueil (toujours visible)
 *   - Ma réservation (visible uniquement si une résa est vivante)
 *   - Profil (toujours visible)
 *
 * Rendue dans `layout.tsx` pour ne s'afficher qu'une fois et conserver son
 * scroll state lors des navigations. Masquée sur /login et tant que l'auth
 * n'est pas résolue (sinon flash de la nav avant redirection).
 *
 * Réutilise le queryKey `['reservation-active']` partagé avec la home et
 * `/reservations/<id>` → un seul fetch pour les 3 surfaces.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  const activeReservationQuery = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })

  if (loading || !user) return null
  if (pathname.startsWith('/login')) return null

  const tabs: Tab[] = [
    {
      href: '/',
      label: 'Accueil',
      icon: Home,
      isActive: (p) => p === '/',
    },
  ]

  const activeReservation = activeReservationQuery.data
  if (activeReservation) {
    tabs.push({
      href: `/reservations/${activeReservation.id}`,
      label: 'Ma résa',
      icon: QrCode,
      isActive: (p) => p.startsWith('/reservations/'),
    })
  }

  tabs.push({
    href: '/profile',
    label: 'Profil',
    icon: User,
    isActive: (p) => p.startsWith('/profile'),
  })

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-900/90 pb-[var(--safe-bottom)] backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {tabs.map((tab) => {
          const active = tab.isActive(pathname)
          const Icon = tab.icon
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                aria-label={tab.label}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-2.5 transition-colors duration-base ease-out-soft',
                  active
                    ? 'text-emerald-300'
                    : 'text-white/55 hover:text-white/85',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="text-[10px] font-medium uppercase tracking-wider">
                  {tab.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
