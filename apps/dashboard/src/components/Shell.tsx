'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { Menu, X } from 'lucide-react'

import { cn } from '../lib/cn'
import type { SessionPayload } from '../lib/session'
import { useLang } from '../lib/lang-client'
import { commonStrings } from '../lib/i18n/common'
import { Sidebar } from './Sidebar'

const PUBLIC_PATHS = ['/login', '/accept-invite']

export function Shell({
  children,
  user,
}: {
  children: ReactNode
  user: SessionPayload | null
}) {
  const pathname = usePathname() ?? ''
  const lang = useLang()
  const t = commonStrings(lang)
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const [mobileOpen, setMobileOpen] = useState(false)

  // Ferme automatiquement le drawer au changement de route — UX classique
  // mobile : tap sur un item → navigation → drawer se ferme.
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll quand le drawer est ouvert (sinon le contenu derrière
  // continue à scroller, c'est désagréable sur iOS).
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
    return undefined
  }, [mobileOpen])

  if (isPublic) return <>{children}</>

  return (
    <div className="flex min-h-screen">
      {/* Bouton hamburger — visible uniquement sous md */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t.a11yOpenMenu}
        aria-expanded={mobileOpen}
        className="fixed left-3 top-3 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border transition-colors duration-base ease-out-soft backdrop-blur md:hidden border-gray-200 bg-white/90 text-navy-900 hover:bg-gray-100 dark:border-white/10 dark:bg-navy-800/90 dark:text-white/80 dark:hover:bg-navy-700"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Backdrop — visible quand drawer ouvert, sous md uniquement */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          'fixed inset-0 z-40 backdrop-blur-sm transition-opacity duration-base md:hidden',
          'bg-navy-900/40 dark:bg-black/60',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden="true"
      />

      {/* Sidebar :
          - desktop (md+) : layout normal sticky, prend sa place dans la grille
          - mobile (< md) : fixed overlay, slide depuis la gauche */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 ease-out md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar user={user} />
        {/* Bouton fermer dédié, mobile uniquement */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label={t.a11yCloseMenu}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-base md:hidden text-gray-500 hover:bg-gray-100 hover:text-navy-900 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <main className="min-w-0 flex-1 px-4 py-6 pt-16 md:px-8 md:py-8 md:pt-8">{children}</main>
    </div>
  )
}
