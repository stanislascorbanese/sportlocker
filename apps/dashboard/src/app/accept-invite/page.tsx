'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createUserWithEmailAndPassword } from 'firebase/auth'

import { getFirebaseAuth } from '../../lib/firebase'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return "Un compte Firebase existe déjà pour cet email. Connectez-vous via la page de connexion."
    case 'auth/invalid-email':
      return 'Adresse email invalide.'
    case 'auth/weak-password':
      return 'Le mot de passe est trop faible (6 caractères minimum).'
    default:
      return "Création de compte impossible. Réessayez."
  }
}

function mapApiError(code: string): string {
  switch (code) {
    case 'invite_not_found':
    case 'invite_expired':
    case 'invite_already_accepted':
      return "Ce lien d'invitation est expiré ou a déjà été utilisé."
    case 'email_mismatch':
      return "L'email de votre compte ne correspond pas à celui de l'invitation."
    default:
      return "L'activation du compte a échoué. Réessayez."
  }
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search?.get('token') ?? ''
  const invitedEmail = search?.get('email') ?? ''

  const [email, setEmail] = useState(invitedEmail)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const tokenMissing = !token

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    if (password.length < 8) {
      setError('Mot de passe : 8 caractères minimum.')
      return
    }
    setLoading(true)
    try {
      const auth = getFirebaseAuth()
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      const idToken = await cred.user.getIdToken()

      const apiRes = await fetch(`${API_URL}/v1/admin/invites/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, firebaseIdToken: idToken }),
      })
      if (!apiRes.ok) {
        const body = await apiRes.json().catch(() => ({})) as { error?: string }
        setError(mapApiError(body.error ?? ''))
        return
      }
      const { sessionToken } = await apiRes.json() as { sessionToken: string }

      const cookieRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      if (!cookieRes.ok) {
        setError("Activation OK mais session non créée. Connectez-vous depuis la page de connexion.")
        return
      }

      router.replace('/')
      router.refresh()
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(code.startsWith('auth/') ? mapFirebaseError(code) : "Activation impossible. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
        <h1 className="font-display text-xl tracking-tight">
          SportLocker <span className="text-emerald-400">· ops</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/40">Activation du compte</p>

        {tokenMissing ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Lien invalide : token manquant.
            </div>
            <Link href="/login" className="block text-center text-xs text-emerald-300 hover:underline">
              Aller à la page de connexion
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-white/50">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={!!invitedEmail}
                  className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60 read-only:cursor-not-allowed read-only:opacity-70"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-wider text-white/50">Mot de passe</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                />
              </label>

              <label className="block">
                <span className="text-xs uppercase tracking-wider text-white/50">Confirmation</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
                />
              </label>

              {error && (
                <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password || !confirm}
                className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Activation…' : 'Activer mon compte'}
              </button>
            </form>

            <p className="mt-5 text-[11px] text-white/30">
              Déjà inscrit ? <Link href="/login" className="text-emerald-300 hover:underline">Se connecter</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
