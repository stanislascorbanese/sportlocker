'use client'

import { useState } from 'react'
import { KeyRound, Check, AlertCircle, Loader2 } from 'lucide-react'

type State = 'idle' | 'sending' | 'sent' | 'error'

/**
 * Déclenche l'envoi d'un e-mail brandé "reset password" à l'adresse courante.
 * POST `/api/password-reset` → API SportLocker : génère le lien (oobCode signé,
 * valable 1h via l'Admin SDK Firebase) et envoie un e-mail FR brandé via Resend.
 * On ne révèle rien si l'email n'existe pas (anti-énumération, géré côté API).
 */
export function ResetPasswordButton({ email }: { email: string }) {
  const [state, setState] = useState<State>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  async function send() {
    setState('sending')
    setErrorDetail(null)
    try {
      const res = await fetch('/api/password-reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('sent')
    } catch (err) {
      setState('error')
      setErrorDetail(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  if (state === 'sent') {
    return (
      <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        <Check className="h-4 w-4 text-emerald-300" />
        <span>Email envoyé à <span className="font-mono">{email}</span></span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={send}
        disabled={state === 'sending'}
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/80 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50"
      >
        {state === 'sending' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="h-4 w-4" />
        )}
        {state === 'sending' ? 'Envoi en cours…' : 'Changer mon mot de passe'}
      </button>
      {state === 'error' && (
        <div className="inline-flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="font-medium">Échec de l&apos;envoi du mail</p>
            {errorDetail && <p className="mt-0.5 font-mono text-[11px] text-rose-300/80">{errorDetail}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
