'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createUserWithEmailAndPassword } from 'firebase/auth'

import { getFirebaseAuth } from '../../lib/firebase'
import { useLang } from '../../lib/lang-client'
import { authStrings } from '../../lib/i18n/auth'
import type { Lang } from '../../lib/lang'

function mapFirebaseError(lang: Lang, code: string): string {
  const t = authStrings(lang)
  switch (code) {
    case 'auth/email-already-in-use': return t.inviteFbEmailInUse
    case 'auth/invalid-email':        return t.inviteFbInvalidEmail
    case 'auth/weak-password':        return t.inviteFbWeakPwd
    default:                          return t.inviteFbGeneric
  }
}

function mapApiError(lang: Lang, code: string): string {
  const t = authStrings(lang)
  switch (code) {
    case 'invite_not_found':
    case 'invite_expired':
    case 'invite_already_accepted': return t.inviteApiNotFound
    case 'email_mismatch':          return t.inviteApiEmailMismatch
    default:                        return t.inviteApiGeneric
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export default function AcceptInvitePage() {
  const router = useRouter()
  const search = useSearchParams()
  const token = search?.get('token') ?? ''
  const invitedEmail = search?.get('email') ?? ''
  const lang = useLang()
  const t = authStrings(lang)

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
      setError(t.inviteErrMismatch2)
      return
    }
    if (password.length < 8) {
      setError(t.inviteErrTooShort2)
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
        setError(mapApiError(lang, body.error ?? ''))
        return
      }
      const { sessionToken } = await apiRes.json() as { sessionToken: string }

      const cookieRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionToken }),
      })
      if (!cookieRes.ok) {
        setError(t.inviteSessionFailed)
        return
      }

      router.replace('/')
      router.refresh()
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setError(code.startsWith('auth/') ? mapFirebaseError(lang, code) : t.inviteGenericFail)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
        <h1 className="font-display text-xl tracking-tight">
          SportLocker <span className="text-emerald-400">{t.brandSuffix}</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/40">{t.inviteEyebrow}</p>

        {tokenMissing ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {t.inviteLinkInvalid}
            </div>
            <Link href="/login" className="block text-center text-xs text-emerald-300 hover:underline">
              {t.inviteGoToLogin}
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs uppercase tracking-wider text-white/50">{t.fieldEmail}</span>
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
                <span className="text-xs uppercase tracking-wider text-white/50">{t.fieldPassword}</span>
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
                <span className="text-xs uppercase tracking-wider text-white/50">{t.inviteFieldConfirmation}</span>
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
                {loading ? t.inviteBtnSubmitting : t.inviteBtnSubmit}
              </button>
            </form>

            <p className="mt-5 text-[11px] text-white/30">
              {t.inviteAlreadyRegistered} <Link href="/login" className="text-emerald-300 hover:underline">{t.inviteSignInLink}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
