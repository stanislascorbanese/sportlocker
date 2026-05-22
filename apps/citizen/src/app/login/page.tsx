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

import { registerCurrentUser } from '../../lib/api'
import { useAuth } from '../../lib/auth-context'
import { cn } from '../../lib/cn'
import { getFirebaseAuth } from '../../lib/firebase'

const EMAIL_LINK_STORAGE_KEY = 'sl-emailForSignIn'

/**
 * Méthodes d'authentification actives côté citoyen :
 *   - Google (gratuit)
 *   - Apple (gratuit)
 *   - Email magic link via `sendSignInLinkToEmail` (gratuit)
 *
 * **Phone Auth désactivé** : Firebase Phone Auth exige le plan Blaze
 * (facturation activée), ce qui n'est pas le cas du projet pour le moment
 * → l'envoi de SMS plantait avec `auth/billing-not-enabled` côté user.
 * Pour réactiver, basculer Firebase sur Blaze (Console → Upgrade) et
 * restaurer le bouton + `<PhoneForm/>` depuis git history (commit
 * précédent #140 ou antérieur).
 */
type Method = 'pick' | 'email'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
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
      setError('Email manquant pour finaliser la connexion. Recommence depuis cet appareil.')
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
  }, [router])

  // Redirige vers l'accueil si déjà connecté.
  useEffect(() => {
    if (!loading && user) router.replace('/')
  }, [loading, user, router])

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
        <h1 className="font-display text-3xl font-bold">
          SportLocker <span className="text-emerald-400">·</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/50">App citoyenne</p>
        <p className="mt-6 text-sm text-white/70">
          Connecte-toi pour emprunter du matos sport gratuitement près de chez toi.
        </p>

        {method === 'pick' && (
          <div className="mt-6 space-y-2.5">
            <ProviderButton
              label="Continuer avec Google"
              onClick={() => handleOAuth(new GoogleAuthProvider(), setBusy, setError, router)}
              disabled={busy}
            >
              <GoogleIcon className="h-4 w-4" />
            </ProviderButton>

            <ProviderButton
              label="Continuer avec Apple"
              onClick={() => handleOAuth(new OAuthProvider('apple.com'), setBusy, setError, router)}
              disabled={busy}
            >
              <Apple className="h-4 w-4" />
            </ProviderButton>

            <ProviderButton
              label="Continuer avec email"
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

        {error && (
          <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-[11px] text-rose-200">
            {error}
          </p>
        )}
      </div>
      <p className="mt-6 text-center text-[11px] text-white/40">
        En te connectant, tu acceptes les conditions d'utilisation.
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
        <p className="text-emerald-300">✓ Lien envoyé à <strong>{email}</strong></p>
        <p className="text-white/60 text-[12px]">
          Ouvre ton mail et clique sur le lien pour te connecter. Il faut le faire <em>sur cet appareil</em>.
        </p>
        <button type="button" onClick={onBack} className="text-emerald-300 text-[12px] hover:text-emerald-200">
          ← Choisir une autre méthode
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-white/50">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="toi@exemple.fr"
          className="mt-1.5 w-full rounded-lg border border-white/15 bg-navy-800 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? 'Envoi…' : 'Recevoir un lien magique'}
      </button>
      <button type="button" onClick={onBack} className="block w-full text-center text-[12px] text-white/50 hover:text-white">
        ← Choisir une autre méthode
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
        'flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition',
        'hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50',
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
      <path fill="#FFC107" d="M21.8 10H12v4h5.6c-.8 2.3-3 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.5 0 2.9.6 4 1.5l2.8-2.8C16.9 3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4 9.6-9.7 0-.8-.1-1.6-.3-2.3z" />
    </svg>
  )
}
