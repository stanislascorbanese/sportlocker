'use client'

import { signOut } from 'firebase/auth'
import { ChevronRight, LogOut, Wallet as WalletIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { PageHeader } from '../../components/ui/PageHeader'
import { useRequireAuth } from '../../lib/auth-context'
import { getFirebaseAuth } from '../../lib/firebase'
import { useT } from '../../lib/i18n/I18nProvider'
import { DeleteAccountSection } from './DeleteAccountSection'
import { InstallButton } from './InstallButton'
import { PushSubscribeButton } from './PushSubscribeButton'
import { ReservationsHistory } from './ReservationsHistory'
import { TrustScoreBadge } from './TrustScoreBadge'

export default function ProfilePage() {
  const user = useRequireAuth()
  const router = useRouter()
  const t = useT()
  if (!user) return null

  async function onSignOut() {
    await signOut(getFirebaseAuth())
    router.replace('/login')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+1rem)] bg-white dark:bg-navy-900">
      <PageHeader title={t('profile.title')} backHref="/" backLabel={t('nav.back')} />

      <section className="space-y-2 rounded-card border p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
        {user.displayName && (
          <p className="text-lg font-semibold text-navy-900 dark:text-white">{user.displayName}</p>
        )}
        {user.email && (
          <p className="text-sm text-gray-600 dark:text-white/70">{user.email}</p>
        )}
        {user.phoneNumber && (
          <p className="font-mono text-sm text-gray-600 dark:text-white/70">{user.phoneNumber}</p>
        )}
        <p className="break-all pt-2 font-mono text-[10px] text-gray-400 dark:text-white/40">
          {t('profile.uid', { uid: user.uid })}
        </p>
      </section>

      <Link
        href="/wallet"
        className="flex items-center justify-between gap-3 rounded-card border px-5 py-4 transition-colors duration-base border-gray-200 bg-gray-50 hover:border-emerald-400 dark:border-white/10 dark:bg-white/5 dark:hover:border-emerald-400/60"
      >
        <span className="flex items-center gap-3">
          <WalletIcon className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
          <span className="text-sm font-medium text-navy-900 dark:text-white">{t('wallet.title')}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-gray-400 dark:text-white/40" aria-hidden="true" />
      </Link>

      <TrustScoreBadge />

      <PushSubscribeButton />
      <InstallButton />
      <ReservationsHistory />

      <button
        type="button"
        onClick={onSignOut}
        className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors duration-base ease-out-soft border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200 dark:hover:bg-rose-500/20"
      >
        <LogOut className="h-4 w-4" />
        {t('profile.logout')}
      </button>

      <DeleteAccountSection />

      {/* Liens légaux — pointent vers la vitrine. */}
      <footer className="pb-4 pt-2 text-center text-meta text-gray-500 dark:text-white/40">
        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
          <li>
            <a
              href="https://sportlocker.fr/cgu"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-base hover:text-navy-900 dark:hover:text-white/70"
            >
              {t('profile.legal.cgu')}
            </a>
          </li>
          <li aria-hidden="true">·</li>
          <li>
            <a
              href="https://sportlocker.fr/confidentialite"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-base hover:text-navy-900 dark:hover:text-white/70"
            >
              {t('profile.legal.privacy')}
            </a>
          </li>
          <li aria-hidden="true">·</li>
          <li>
            <a
              href="https://sportlocker.fr/mentions-legales"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-base hover:text-navy-900 dark:hover:text-white/70"
            >
              {t('profile.legal.mentions')}
            </a>
          </li>
        </ul>
      </footer>
    </main>
  )
}
