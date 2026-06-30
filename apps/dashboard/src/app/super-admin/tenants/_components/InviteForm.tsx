'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'

import type { Lang } from '../../../../lib/lang'
import { superAdminStrings } from '../../../../lib/i18n/super-admin'
import { createInviteAction, type InviteFormState } from '../_actions'

type CommuneOption = { id: string; name: string }

const initialState: InviteFormState = { status: 'idle' }

function SubmitButton({ idle, sending }: { idle: string; sending: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-end rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-navy-900 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? sending : idle}
    </button>
  )
}

export function InviteForm({ communes, lang }: { communes: CommuneOption[]; lang: Lang }) {
  const t = superAdminStrings(lang)
  const [state, formAction] = useFormState(createInviteAction, initialState)
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
      <h2 className="font-display text-base tracking-tight">{t.inviteTitle}</h2>
      <p className="mt-1 text-xs text-white/50">{t.inviteSubtitle}</p>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">{t.fieldEmail}</span>
          <input
            type="email"
            name="email"
            required
            placeholder="contact@mairie.fr"
            className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          />
          {fieldErrors.email && <p className="mt-1 text-[11px] text-red-300">{fieldErrors.email}</p>}
        </label>

        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-white/40">{t.fieldCommune}</span>
          <select
            name="communeId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-md border border-white/10 bg-navy-900/60 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
          >
            <option value="" disabled>{t.selectPlaceholder}</option>
            {communes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {fieldErrors.communeId && <p className="mt-1 text-[11px] text-red-300">{fieldErrors.communeId}</p>}
        </label>

        <SubmitButton idle={t.btnGenerate} sending={t.btnSending} />
      </form>

      {state.status === 'error' && (
        <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {state.message}
        </div>
      )}

      {state.status === 'success' && (
        <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
          <p className="text-white/80">
            {t.successPrefix} <span className="font-medium text-white">{state.email}</span> {t.successInfix}
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
              {copied ? t.btnCopied : t.btnCopy}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
