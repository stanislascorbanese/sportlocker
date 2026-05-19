'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import {
  Home,
  Map,
  Server,
  CalendarClock,
  Wrench,
  Building2,
  Users,
  Package,
  BarChart3,
  Activity,
  FileText,
  ShieldCheck,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '../lib/cn'
import { getFirebaseAuth } from '../lib/firebase'
import type { SessionPayload } from '../lib/session'

type Item = { href: string; label: string; icon: LucideIcon }

const COMMON_ITEMS: Item[] = [
  { href: '/',             label: 'Accueil',       icon: Home },
  { href: '/map',          label: 'Carte',         icon: Map },
  { href: '/distributors', label: 'Distributeurs', icon: Server },
  { href: '/items',        label: 'Articles',      icon: Package },
  { href: '/communes',     label: 'Communes',      icon: Building2 },
  { href: '/users',        label: 'Utilisateurs',  icon: Users },
  { href: '/reservations', label: 'Réservations',  icon: CalendarClock },
  { href: '/maintenance',  label: 'Maintenance',   icon: Wrench },
  { href: '/stats',        label: 'Stats',         icon: BarChart3 },
  { href: '/reports',      label: 'Rapports',      icon: FileText },
  { href: '/audit',        label: 'Audit',         icon: Activity },
]

const SUPER_ADMIN_ITEMS: Item[] = [
  { href: '/super-admin/tenants', label: 'Tenants', icon: ShieldCheck },
]

export function Sidebar({ user }: { user: SessionPayload | null }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const items = user?.role === 'super_admin'
    ? [...COMMON_ITEMS, ...SUPER_ADMIN_ITEMS]
    : COMMON_ITEMS

  async function onLogout() {
    setLoggingOut(true)
    try {
      await signOut(getFirebaseAuth()).catch(() => {})
      await fetch('/api/session', { method: 'DELETE' })
    } finally {
      router.replace('/login')
      router.refresh()
    }
  }

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-white/10 bg-navy-900/80 backdrop-blur">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2" aria-label="SportLocker — accueil">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-icon-outline.png" alt="" className="h-9 w-9 shrink-0" width={36} height={36} />
          <span className="font-display text-lg tracking-tight">
            <span className="text-white">Sport</span>
            <span className="text-brand-500">Locker</span>
            <span className="ml-1 text-emerald-400">· ops</span>
          </span>
        </Link>
        <p className="mt-0.5 pl-9 text-[10px] uppercase tracking-wider text-white/30">Console opérateur</p>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {items.map(({ href, label, icon: Icon }) => {
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

      <div className="mt-auto px-3 py-3">
        {user && (
          <Link
            href="/me"
            className={cn(
              'mb-2 block rounded-lg border px-3 py-2 transition',
              pathname === '/me'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-white/5 bg-white/[0.02] hover:border-emerald-500/20 hover:bg-emerald-500/5',
            )}
            title="Voir mon compte"
          >
            <p className={cn(
              'truncate text-xs',
              pathname === '/me' ? 'text-white' : 'text-white/80',
            )}>
              {user.email}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">
              {roleLabel(user.role)}
              {user.communeId && user.role !== 'super_admin' ? ' · 1 commune' : ''}
            </p>
          </Link>
        )}
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-white/60 transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
        <p className="mt-2 px-3 text-[10px] text-white/30">
          v0.1 · build {process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? 'dev'}
        </p>
      </div>
    </aside>
  )
}

function roleLabel(role: SessionPayload['role']): string {
  switch (role) {
    case 'super_admin': return 'Super-admin'
    case 'admin':       return 'Admin'
    case 'operator':    return 'Opérateur'
  }
}
