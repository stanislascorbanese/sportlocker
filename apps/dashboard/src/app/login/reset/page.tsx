'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'

/**
 * Page de réinitialisation de mot de passe pour la console ops.
 *
 * Flux :
 *   1. L'admin saisit son email
 *   2. On POST `/api/password-reset` (route handler Next) qui relaie à l'API
 *      SportLocker. L'API génère le lien d'action via l'Admin SDK Firebase et
 *      envoie un e-mail FR brandé via Resend (vs e-mail Firebase générique en
 *      anglais classé en spam).
 *   3. L'e-mail contient un lien `…/__/auth/action?mode=resetPassword&oobCode=…`
 *      qui affiche la page de saisie du nouveau password
 *   4. Une fois validé, l'admin revient se connecter avec le nouveau password
 *
 * Note sécurité : on affiche TOUJOURS la même confirmation, même si l'email
 * n'existe pas en base. Évite l'énumération de comptes (un attaquant ne peut
 * pas distinguer un email valide d'un invalide) — l'API applique la même règle.
 */
export default function ResetPasswordPage() {
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
        // 400 = email invalide côté serveur. Tout le reste reste neutre.
        setError('Adresse email invalide.')
        setStatus('error')
        return
      }
      setStatus('sent')
    } catch {
      setError('Connexion réseau impossible. Vérifie ta connexion.')
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
          Retour à la connexion
        </Link>

        <h1 className="font-display text-xl tracking-tight">
          Mot de passe <span className="text-emerald-400">oublié ?</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-white/40">Réinitialisation</p>

        {status === 'sent' ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
              Si <strong className="font-semibold">{email.trim()}</strong> correspond à un compte, un
              email avec un lien de réinitialisation vient d'être envoyé. Vérifie ta boîte mail
              (et tes spams).
            </div>
            <p className="text-[11px] leading-relaxed text-white/50">
              Le lien expire après 1 heure. Si tu ne reçois rien dans 5 min, vérifie que l'adresse
              saisie correspond bien à ton compte ops ou contacte l'équipe SportLocker.
            </p>
            <Link
              href="/login"
              className="block w-full rounded-md bg-emerald-500 px-3 py-2 text-center text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <p className="text-sm text-white/60">
              Saisis l'email de ton compte ops. Tu recevras un lien pour choisir un nouveau mot de
              passe.
            </p>
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
              {status === 'sending' ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
            </button>
          </form>
        )}

        <p className="mt-5 text-[11px] text-white/30">
          Ce lien sert uniquement à réinitialiser ton mot de passe. Aucun login automatique.
        </p>
      </div>
    </div>
  )
}
