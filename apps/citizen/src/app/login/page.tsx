'use client'

import {
  GoogleAuthProvider,
  OAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
} from 'firebase/auth'
import { Apple, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LanguageToggle } from '../../components/LanguageToggle'
import { ThemeToggle } from '../../components/ThemeToggle'
import { ErrorState } from '../../components/ui/ErrorState'
import { registerCurrentUser } from '../../lib/api'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { getFirebaseAuth } from '../../lib/firebase'
import { useT } from '../../lib/i18n/I18nProvider'

const EMAIL_LINK_STORAGE_KEY = 'sl-emailForSignIn'

/**
 * Méthodes d'authentification actives côté citoyen :
 *   - Google (gratuit)
 *   - Apple (gratuit)
 *   - Email magic link via `sendSignInLinkToEmail` (gratuit)
 *
 * **Phone Auth désactivé** : Firebase Phone Auth exige le plan Blaze
 * (facturation activée), ce qui n'est pas le cas du projet pour le moment.
 */
type Method = 'pick' | 'email'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const t = useT()
  const [method, setMethod] = useState<Method>('pick')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Si l'utilisateur arrive sur /login avec un magic link déjà signé,
  // on finalise la signature ici puis on redirige vers /.
  useEffect(() => {
    const url = window.location.href
    if (!isSignInWithEmailLink(getFirebaseAuth(), url)) return
    const email = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY)
    if (!email) {
      setError(t('auth.email_missing'))
      return
    }
    setBusy(true)
    signInWithEmailLink(getFirebaseAuth(), email, url)
      .then(async () => {
        window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY)
        await registerCurrentUser().catch(() => undefined)
        router.replace('/')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }, [router, t])

  // Redirige vers l'accueil si déjà connecté.
  useEffect(() => {
    if (!loading && user) router.replace('/')
  }, [loading, user, router])

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      {/* Bandeau settings haut-droite — accessible avant login pour qu'un
          touriste arrive directement en EN si c'est sa préférence. */}
      <div className="absolute right-5 top-[calc(var(--safe-top)+0.75rem)] flex items-center gap-1.5">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <div className="rounded-card border p-7 shadow-elevated border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <h1 className="font-display text-3xl font-bold">
          SportLocker <span className="text-emerald-600 dark:text-emerald-400">·</span>
        </h1>
        <p className="mt-1 text-eyebrow uppercase text-gray-500 dark:text-white/50">
          {t('auth.app_label')}
        </p>
        <p className="mt-6 text-sm text-gray-600 dark:text-white/70">{t('auth.tagline')}</p>

        {method === 'pick' && (
          <div className="mt-6 space-y-2.5">
            <ProviderButton
              label={t('auth.with_google')}
              onClick={() => handleOAuth(new GoogleAuthProvider(), setBusy, setError, router)}
              disabled={busy}
            >
              <GoogleIcon className="h-4 w-4" />
            </ProviderButton>

            <ProviderButton
              label={t('auth.with_apple')}
              onClick={() => handleOAuth(new OAuthProvider('apple.com'), setBusy, setError, router)}
              disabled={busy}
            >
              <Apple className="h-4 w-4" />
            </ProviderButton>

            <ProviderButton
              label={t('auth.with_email')}
              onClick={() => { setError(null); setMethod('email') }}
              disabled={busy}
            >
              <Mail className="h-4 w-4" />
            </ProviderButton>
          </div>
        )}

        {method === 'email' && (
          <EmailLinkForm
            onBack={() => setMethod('pick')}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        )}

        {error && <ErrorState className="mt-4" message={error} />}
      </div>
      <p className="mt-6 text-center text-meta text-gray-500 dark:text-white/40">
        {t('auth.terms')}
      </p>
    </main>
  )
}

async function handleOAuth(
  provider: GoogleAuthProvider | OAuthProvider,
  setBusy: (b: boolean) => void,
  setError: (e: string | null) => void,
  router: ReturnType<typeof useRouter>,
) {
  setError(null)
  setBusy(true)
  try {
    await signInWithPopup(getFirebaseAuth(), provider)
    await registerCurrentUser().catch(() => undefined)
    router.replace('/')
  } catch (err) {
    setError((err as Error).message)
  } finally {
    setBusy(false)
  }
}

function EmailLinkForm({
  onBack,
  busy,
  setBusy,
  setError,
}: {
  onBack: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  setError: (e: string | null) => void
}) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await sendSignInLinkToEmail(getFirebaseAuth(), email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      })
      window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mt-6 space-y-3 text-sm">
        <p className="text-emerald-600 dark:text-emerald-300">
          ✓ {t('auth.link_sent', { email })}
        </p>
        <p className="text-meta text-gray-600 dark:text-white/60">{t('auth.link_sent_help')}</p>
        <button
          type="button"
          onClick={onBack}
          className="text-meta text-emerald-600 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          ← {t('auth.other_method')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-eyebrow uppercase text-gray-500 dark:text-white/50">
          {t('auth.email')}
        </span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('auth.email_placeholder')}
          className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors duration-base border-gray-300 bg-white text-navy-900 placeholder:text-gray-400 focus:border-emerald-500 dark:border-white/15 dark:bg-navy-800 dark:text-white dark:placeholder:text-white/30 dark:focus:border-emerald-400/60"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors duration-base bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
      >
        {busy ? t('auth.sending') : t('auth.send_magic_link')}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="block w-full text-center text-meta text-gray-500 hover:text-navy-900 dark:text-white/50 dark:hover:text-white"
      >
        ← {t('auth.other_method')}
      </button>
    </form>
  )
}

function ProviderButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors duration-base',
        'border-gray-200 bg-white text-navy-900 hover:border-gray-300 hover:bg-gray-50',
        'dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {children}
      {label}
    </button>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M21.8 10H12v4h5.6c-.8 2.3-3 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.5 0 2.9.6 4 1.5l2.8-2.8C16.9 3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4 9.6-9.7 0-.8-.1-1.6-.3-2.3z"
      />
    </svg>
  )
}
