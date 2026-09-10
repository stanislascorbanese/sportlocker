'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { signOut } from 'firebase/auth'
import {
  Home,
  PackageOpen,
  AlertTriangle,
  MonitorSmartphone,
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
  Stethoscope,
  Bot,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '../lib/cn'
import { getFirebaseAuth } from '../lib/firebase'
import { useLang } from '../lib/lang-client'
import type { SessionPayload } from '../lib/session'
import { sidebarStrings } from '../lib/sidebar-i18n'
import { commonStrings } from '../lib/i18n/common'
import { LanguageSelector } from './LanguageSelector'
import { ThemeToggle } from './ThemeToggle'

type LabelKey = keyof ReturnType<typeof sidebarStrings>
type Item = { href: string; labelKey: LabelKey; icon: LucideIcon }
/** Un groupe sans titre est rendu en tête, sans séparateur. */
type Group = { titleKey?: LabelKey; items: Item[] }

/**
 * La navigation est groupée par fréquence d'usage, pas par nature technique.
 *
 * Un camping a une à quatre bornes. Il ouvre deux écrans tous les jours — quels
 * casiers regarnir, ce qui n'est pas rentré — et le reste au mieux une fois par
 * semaine. Une liste plate de quatorze entrées faisait porter au gérant le
 * travail de retrouver les deux qui comptent.
 *
 * Retirés en septembre 2026 : la tarification et les paiements. SportLocker
 * n'encaisse plus rien du vacancier (cf. docs/CDC.md v2).
 */
const GROUPS: Group[] = [
  {
    items: [
      { href: '/',           labelKey: 'navHome',       icon: Home },
      { href: '/reassort',   labelKey: 'navReassort',   icon: PackageOpen },
      { href: '/non-rendus', labelKey: 'navUnreturned', icon: AlertTriangle },
      { href: '/sejours',    labelKey: 'navStays',      icon: Users },
    ],
  },
  {
    titleKey: 'groupParc',
    items: [
      { href: '/distributors', labelKey: 'navDistributors', icon: Server },
      { href: '/items',        labelKey: 'navItems',        icon: Package },
      { href: '/maintenance',  labelKey: 'navMaintenance',  icon: Wrench },
    ],
  },
  {
    titleKey: 'groupSaison',
    items: [
      { href: '/reservations', labelKey: 'navReservations', icon: CalendarClock },
      { href: '/stats',        labelKey: 'navStats',        icon: BarChart3 },
      { href: '/reports',      labelKey: 'navReports',      icon: FileText },
    ],
  },
  {
    titleKey: 'groupReglages',
    items: [
      { href: '/health',   labelKey: 'navHealth',   icon: Stethoscope },
      { href: '/map',      labelKey: 'navMap',      icon: Map },
      { href: '/communes', labelKey: 'navCommunes', icon: Building2 },
      { href: '/users',    labelKey: 'navUsers',    icon: Users },
      { href: '/audit',    labelKey: 'navAudit',    icon: Activity },
    ],
  },
]

const SUPER_ADMIN_ITEMS: Item[] = [
  { href: '/super-admin/tenants', labelKey: 'navTenants', icon: ShieldCheck },
  { href: '/super-admin/agent-office', labelKey: 'navAgentOffice', icon: Bot },
]

export function Sidebar({ user }: { user: SessionPayload | null }) {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const lang = useLang()
  const t = sidebarStrings(lang)
  const c = commonStrings(lang)
  const [loggingOut, setLoggingOut] = useState(false)

  const groups: Group[] =
    user?.role === 'super_admin'
      ? [...GROUPS, { titleKey: 'navTenants' as const, items: SUPER_ADMIN_ITEMS }]
      : GROUPS

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
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r backdrop-blur border-gray-200 bg-white/80 dark:border-white/10 dark:bg-navy-900/80">
      <div className="px-5 py-5">
        <Link href="/" className="flex items-center gap-2" aria-label={c.a11ySidebarHome}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark-outline.png" alt="" className="h-9 w-9 shrink-0" width={36} height={36} />
          <span className="font-display text-lg tracking-tight">
            <span className="text-navy-900 dark:text-white">Sport</span>
            {/* emerald-500 plutôt que brand-500 (= bleu legacy) pour cohérence
                avec le reste de la marque (vitrine = emerald, accents partout
                dans le dashboard = emerald-500/600). */}
            <span className="text-emerald-500">Locker</span>
            <span className="ml-1 text-emerald-600 dark:text-emerald-400">· ops</span>
          </span>
        </Link>
        <p className="mt-0.5 pl-9 text-eyebrow uppercase text-gray-400 dark:text-white/30">
          {t.consoleSubtitle}
        </p>
      </div>

      <nav className="mt-2 flex flex-col gap-0.5 px-3">
        {groups.map((group, groupIndex) => (
          <div key={group.titleKey ?? `g${groupIndex}`} className={groupIndex > 0 ? 'mt-5' : ''}>
            {group.titleKey && (
              <p className="mb-1.5 px-3 text-eyebrow font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
                {t[group.titleKey]}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, labelKey, icon: Icon }) => {
                const active = href === '/' ? pathname === '/' : pathname.startsWith(href)

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-base ease-out-soft',
                      active
                        ? 'bg-emerald-100 text-navy-900 dark:bg-emerald-500/10 dark:text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-navy-900 dark:text-white/60 dark:hover:bg-white/[0.04] dark:hover:text-white',
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                    )}
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        active
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : 'text-gray-400 dark:text-white/50',
                      )}
                    />
                    <span>{t[labelKey]}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}

        {/* Le mode accueil n'est pas une page de plus : c'est l'écran qu'on
            laisse ouvert sur la tablette de la réception toute la saison. Il
            mérite d'être trouvable sans chercher. */}
        <Link
          href="/accueil"
          className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 transition-colors duration-base ease-out-soft hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
        >
          <span className="flex items-center gap-3 text-sm font-medium text-emerald-800 dark:text-emerald-200">
            <MonitorSmartphone className="h-4 w-4 shrink-0" />
            {t.navKiosk}
          </span>
          <span className="mt-0.5 block pl-7 text-eyebrow leading-snug text-emerald-700/70 dark:text-emerald-200/50">
            {t.kioskHint}
          </span>
        </Link>
      </nav>

      <div className="mt-auto px-3 py-3">
        {user && (
          <Link
            href="/me"
            className={cn(
              'mb-2 block rounded-lg border px-3 py-2 transition-colors duration-base ease-out-soft',
              pathname === '/me'
                ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                : 'border-gray-200 bg-gray-50 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-emerald-500/20 dark:hover:bg-emerald-500/5',
            )}
            title={c.a11yViewAccount}
          >
            <p
              className={cn(
                'truncate text-xs',
                pathname === '/me'
                  ? 'text-navy-900 dark:text-white'
                  : 'text-gray-700 dark:text-white/80',
              )}
            >
              {user.email}
            </p>
            <p className="mt-0.5 text-eyebrow uppercase text-gray-500 dark:text-white/40">
              {roleLabel(user.role, t)}
              {user.communeId && user.role !== 'super_admin' ? ` · ${t.oneCommune}` : ''}
            </p>
          </Link>
        )}
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <LanguageSelector />
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors duration-base disabled:opacity-50 text-gray-600 hover:bg-gray-100 hover:text-navy-900 dark:text-white/60 dark:hover:bg-white/[0.04] dark:hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          {loggingOut ? t.loggingOut : t.logout}
        </button>
        <p className="mt-2 px-3 text-eyebrow text-gray-400 dark:text-white/30">
          v0.1 · build {process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? 'dev'}
        </p>
      </div>
    </aside>
  )
}

function roleLabel(
  role: SessionPayload['role'],
  t: ReturnType<typeof sidebarStrings>,
): string {
  switch (role) {
    case 'super_admin': return t.roleSuperAdmin
    case 'admin':       return t.roleAdmin
    case 'operator':    return t.roleOperator
  }
}
