'use client'

import { useActionState, useState } from 'react'

import { createInviteAction, type InviteFormState } from '../_actions'

type CommuneOption = { id: string; name: string }

const initialState: InviteFormState = { status: 'idle' }

export function InviteForm({ communes }: { communes: CommuneOption[] }) {
  const [state, formAction, pending] = useActionState(createInviteAction, initialState)
  const [copied, setCopied] = useState(false)

  async function copyInviteUrl() {
    if (state.status !== 'success') return
    try {
      await navigator.clipboard.writeText(state.inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard refusé — l'utilisateur peut copier à la main */
    }
  }

  const fieldErrors = state.status === 'error' ? state.fieldErrors ?? {} : {}

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h2 className="font-display text-base tracking-tight">Inviter un admin de commune</h2>
      <p className="mt-1 text-xs text-white/50">
        L'admin recevra l'URL d'invitation à coller dans un mail. Le lien expire après 7 jours.
      </p>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Email</span>
          <input
            type="email"
            name="email"
            required
            placeholder="maire@ville.fr"
            className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
          {fieldErrors.email && <p className="mt-1 text-[11px] text-red-300">{fieldErrors.email}</p>}
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Commune</span>
          <select
            name="communeId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          >
            <option value="" disabled>— sélectionner —</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {fieldErrors.communeId && <p className="mt-1 text-[11px] text-red-300">{fieldErrors.communeId}</p>}
        </label>

        <button
          type="submit"
          disabled={pending}
          className="self-end rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Envoi…' : 'Générer l’invitation'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <p className="text-white/80">
            Invitation pour <span className="font-medium text-white">{state.email}</span> générée.
            Copiez l'URL ci-dessous et envoyez-la par mail à la mairie.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-navy-900/60 px-2 py-1.5 font-mono text-[11px] text-emerald-200">
              {state.inviteUrl}
            </code>
            <button
              type="button"
              onClick={copyInviteUrl}
              className="rounded-md border border-white/10 px-3 py-1.5 text-[11px] text-white/80 transition hover:bg-white/[0.06]"
            >
              {copied ? 'Copié ✓' : 'Copier'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
