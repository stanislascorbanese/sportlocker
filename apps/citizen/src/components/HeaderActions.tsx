'use client'

import { useQuery } from '@tanstack/react-query'
import { QrCode, User } from 'lucide-react'
import Link from 'next/link'

import { fetchActiveReservation } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { useT } from '../lib/i18n/I18nProvider'
import { LanguageToggle } from './LanguageToggle'
import { ThemeToggle } from './ThemeToggle'

/**
 * Composition globale des boutons du header :
 *
 *   - Bouton "Ma résa" (QR) : visible **uniquement** si l'utilisateur a une
 *     réservation vivante. Raccourci direct vers /reservations/<id>.
 *   - Toggle FR/EN
 *   - Toggle dark/light
 *   - Bouton profil → /profile (avec icône utilisateur)
 *
 * Réutilise le queryKey `['reservation-active']` partagé avec la home — un
 * seul fetch alimente le banner home + l'indicateur Ma résa du header.
 */
export function HeaderActions() {
  const t = useT()
  const { user } = useAuth()

  const activeReservationQuery = useQuery({
    queryKey: ['reservation-active'],
    queryFn: fetchActiveReservation,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })
  const activeReservation = activeReservationQuery.data

  return (
    <div className="flex items-center gap-1.5">
      {activeReservation && (
        <Link
          href={`/reservations/${activeReservation.id}`}
          aria-label={t('nav.active_reservation')}
          title={t('nav.active_reservation')}
          className="relative rounded-full bg-emerald-100 p-2 text-emerald-700 transition-colors duration-base ease-out-soft hover:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30"
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          {/* Dot indicator de présence — plus discret qu'un badge texte. */}
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-navy-900"
          />
        </Link>
      )}
      <LanguageToggle />
      <ThemeToggle />
      <Link
        href="/profile"
        aria-label={t('nav.profile_aria')}
        className="rounded-full bg-gray-100 p-2 text-navy-900 transition-colors duration-base ease-out-soft hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
      >
        <User className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}
