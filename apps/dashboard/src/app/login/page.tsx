'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInWithEmailAndPassword } from 'firebase/auth'

import { getFirebaseAuth } from '../../lib/firebase'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

function mapFirebaseError(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Adresse email invalide.'
    case 'auth/user-disabled':
      return 'Ce compte a été désactivé.'
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email ou mot de passe incorrect.'
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessayez dans quelques minutes.'
    default:
      return 'Connexion impossible. Réessayez.'
  }
}

export default function LoginPage() {
  const router = useRouter()
  const search = useSearchParams()
  const redirectTo = search?.get('redirect') ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const auth = getFirebaseAuth()
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
      const idToken = await cred.user.getIdToken()

      const apiRes = await fetch(`${API_URL}/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firebaseIdToken: idToken }),
      })
      if (!apiRes.ok) {
        const body = await apiRes.json().catch(() => ({}))
        throw new Error(body?.error ?? `api_${apiRes.status}`)
      }
      const { sessionToken } = await apiRes.json() as { sessionToken: string }

      const cookieRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      if (!cookieRes.ok) throw new Error('session_cookie_failed')

      router.replace(redirectTo)
      router.refresh()
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      const msg = code.startsWith('auth/')
        ? mapFirebaseError(code)
        : (err as Error).message === 'forbidden'
          ? "Votre compte n'a pas accès à ce dashboard."
          : 'Connexion impossible. Réessayez.'
      setError(msg)
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
        <p className="mt-1 text-xs uppercase tracking-wider text-white/40">Console opérateur</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-white/50">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wider text-white/50">Mot de passe</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            disabled={loading || !email || !password}
            className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>

          <div className="text-center">
            <Link
              href="/login/reset"
              className="text-xs text-emerald-400/80 hover:text-emerald-300 hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </div>
        </form>

        <p className="mt-5 text-[11px] text-white/30">
          Accès réservé aux administrateurs SportLocker et aux référents communaux invités.
        </p>
      </div>
    </div>
  )
}
