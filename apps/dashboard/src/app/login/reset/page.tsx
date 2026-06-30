'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useLang } from '../../../lib/lang-client'
import { authStrings } from '../../../lib/i18n/auth'

export default function ResetPasswordPage() {
  const lang = useLang()
  const t = authStrings(lang)

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setStatus('sending')
    try {
      const res = await fetch('/api/password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      if (!res.ok) {
        setError(t.resetErrorInvalid)
        setStatus('error')
        return
      }
      setStatus('sent')
    } catch {
      setError(t.resetErrorNetwork)
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-2xl">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.backToLogin}
        </Link>

        <h1 className="font-display text-xl tracking-tight">
          {t.resetTitle1} <span className="text-emerald-400">{t.resetTitle2}</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/40">{t.resetEyebrow}</p>

        {status === 'sent' ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
              {t.resetIfMatch1} <strong className="font-semibold">{email.trim()}</strong> {t.resetIfMatch2}
            </div>
            <p className="text-[11px] leading-relaxed text-white/50">{t.resetExpiresHint}</p>
            <Link
              href="/login"
              className="block w-full rounded-md bg-emerald-500 px-3 py-2 text-center text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
            >
              {t.backToLogin}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <p className="text-sm text-white/60">{t.resetIntro}</p>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-white/50">{t.fieldEmail}</span>
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

            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending' || !email}
              className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === 'sending' ? t.btnSending : t.btnSendResetLink}
            </button>
          </form>
        )}

        <p className="mt-5 text-[11px] text-white/30">{t.resetFooter}</p>
      </div>
    </div>
  )
}
