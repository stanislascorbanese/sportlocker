'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { Invite } from '../../../lib/api'
import type { Lang } from '../../../lib/lang'
import { invitesStrings } from '../../../lib/i18n/invites'
import { createInviteAction } from './_actions'

export type CommuneOption = { id: string; name: string }

export function InviteForm({
  isSuperAdmin,
  communes,
  demo = false,
  lang,
}: {
  isSuperAdmin: boolean
  communes: CommuneOption[]
  demo?: boolean
  lang: Lang
}) {
  const t = invitesStrings(lang)
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [communeId, setCommuneId] = useState('')
  const [created, setCreated] = useState<Invite | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    if (demo) { alert(t.demoBlocker); return }
    if (isSuperAdmin && communeId === '') { setError(t.communePlaceholder); return }
    startTransition(() => {
      void (async () => {
        const res = await createInviteAction({
          email,
          ...(isSuperAdmin && communeId ? { communeId } : {}),
        })
        if (!res.ok) { setError(res.error); return }
        setCreated(res.invite)
        setCopied(false)
        setEmail('')
        setCommuneId('')
        router.refresh()
      })()
    })
  }

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.inviteUrl)
      setCopied(true)
    } catch { /* clipboard indispo : le lien reste sélectionnable */ }
  }

  return (
    <section className="rounded-card border bg-white p-4 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
      <h3 className="font-medium text-navy-900 dark:text-white">{t.formTitle}</h3>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label htmlFor="invite-email" className="text-eyebrow text-gray-500 dark:text-white/50">{t.emailLabel}</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t.emailPlaceholder}
            className="min-w-[240px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 placeholder:text-gray-400 dark:border-white/10 dark:bg-navy-700 dark:text-white dark:placeholder:text-white/30"
          />
        </div>

        {isSuperAdmin ? (
          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <label htmlFor="invite-commune" className="text-eyebrow text-gray-500 dark:text-white/50">{t.communeLabel}</label>
            <select
              id="invite-commune"
              value={communeId}
              onChange={(e) => setCommuneId(e.target.value)}
              className="min-w-[200px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-navy-900 dark:border-white/10 dark:bg-navy-700 dark:text-white"
            >
              <option value="">{t.communePlaceholder}</option>
              {communes.map((cm) => <option key={cm.id} value={cm.id}>{cm.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-eyebrow text-gray-500 dark:text-white/50">{t.roleLabel}</span>
            <span className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-white/60">
              {t.roleAdmin}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={isPending || email.trim().length === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-base ease-out-soft hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
        >
          {isPending ? t.submitting : t.submit}
        </button>
      </div>

      <p className="mt-2 text-meta text-gray-500 dark:text-white/40">
        {isSuperAdmin ? t.roleHint : t.communeHintAdmin}
      </p>

      {error && (
        <p className="mt-2 text-meta text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {created && (
        <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-emerald-700 dark:text-emerald-300">{t.createdTitle}</p>
              <p className="mt-1 text-meta text-emerald-700/80 dark:text-emerald-200/70">{t.createdHint}</p>
              <p className="mt-2 break-all font-mono text-meta text-emerald-900 dark:text-emerald-100/90">{created.inviteUrl}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={copy}
                className="rounded-md border border-emerald-300 bg-white px-2 py-1 text-meta font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-transparent dark:text-emerald-200 dark:hover:bg-emerald-500/20"
              >
                {copied ? t.copied : t.copyLink}
              </button>
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="rounded-md px-2 py-1 text-meta text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300/60 dark:hover:text-emerald-100"
              >
                {t.dismiss}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
