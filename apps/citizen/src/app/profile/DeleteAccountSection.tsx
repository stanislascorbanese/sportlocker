'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { signOut } from 'firebase/auth'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '../../components/ui/Button'
import { ApiError, clearSessionToken, deleteMyAccount, fetchMe } from '../../lib/api'
import { getFirebaseAuth } from '../../lib/firebase'
import { useI18n, useT } from '../../lib/i18n/I18nProvider'

const DELAY_DAYS = 30

/**
 * Section "Zone de danger" de /profile : suppression de compte RGPD.
 *
 * Confirmation en 2 temps pour éviter le clic accidentel :
 *   1. bouton "Supprimer mon compte" → révèle l'étape de confirmation
 *   2. l'utilisateur doit saisir le mot SUPPRIMER (localisé) puis valider
 *
 * Le backend fait un soft-delete (`gdpr_delete_requested_at = NOW()`) et le
 * cron RGPD anonymise à J+30 — aucune suppression immédiate. Après succès on
 * déconnecte Firebase et on explique le délai de 30 jours.
 *
 * Si le compte est DÉJÀ programmé pour suppression (gdprDeleteRequestedAt
 * non-null au chargement), on affiche directement l'état "programmé".
 */
type Phase = 'idle' | 'confirming' | 'done'

function formatEffectiveDate(requestedAtISO: string, locale: 'fr' | 'en'): string {
  const effective = new Date(Date.parse(requestedAtISO) + DELAY_DAYS * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(effective)
}

export function DeleteAccountSection() {
  const t = useT()
  const { locale } = useI18n()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, staleTime: 60 * 1000 })

  const alreadyRequested = me?.gdprDeleteRequestedAt ?? null
  const [phase, setPhase] = useState<Phase>('idle')
  const [typed, setTyped] = useState('')
  const [requestedAt, setRequestedAt] = useState<string | null>(null)

  const confirmWord = t('profile.danger.confirm_word')
  const typedMatches = typed.trim().toUpperCase() === confirmWord.toUpperCase()

  const mutation = useMutation({
    mutationFn: deleteMyAccount,
    onSuccess: (res) => {
      setRequestedAt(res.gdprDeleteRequestedAt)
      setPhase('done')
      queryClient.invalidateQueries({ queryKey: ['me'] })
    },
  })

  async function onLogout() {
    await signOut(getFirebaseAuth()).catch(() => undefined)
    clearSessionToken()
    router.replace('/login')
  }

  // ── État "programmé" (succès ou demande préexistante) ─────────────────────
  const effectiveRequestedAt = requestedAt ?? alreadyRequested
  if (phase === 'done' || (phase === 'idle' && effectiveRequestedAt)) {
    return (
      <section className="rounded-card border p-5 border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('profile.danger.done_title')}
          </h2>
        </div>
        <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-100/80">
          {effectiveRequestedAt
            ? t('profile.danger.done_body', { date: formatEffectiveDate(effectiveRequestedAt, locale) })
            : t('profile.danger.done_body', { date: '' })}
        </p>
        <Button variant="secondary" size="md" fullWidth className="mt-4" onClick={onLogout}>
          {t('profile.danger.done_logout')}
        </Button>
      </section>
    )
  }

  // ── État de départ : bouton pour révéler la confirmation ──────────────────
  if (phase === 'idle') {
    return (
      <section className="rounded-card border p-5 border-rose-200 bg-rose-50/60 dark:border-rose-500/25 dark:bg-rose-500/5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-300" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-rose-900 dark:text-rose-200">
            {t('profile.danger.title')}
          </h2>
        </div>
        <p className="mt-2 text-meta text-rose-700/80 dark:text-rose-200/70">
          {t('profile.danger.delete_help')}
        </p>
        <Button
          variant="destructive"
          size="md"
          fullWidth
          className="mt-4"
          icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setPhase('confirming')}
        >
          {t('profile.danger.delete_btn')}
        </Button>
      </section>
    )
  }

  // ── État de confirmation : saisie du mot + validation ─────────────────────
  const errorMessage = mutation.isError
    ? mutation.error instanceof ApiError && mutation.error.status === 409
      ? t('profile.danger.error_active')
      : t('profile.danger.error_generic')
    : null

  return (
    <section className="rounded-card border p-5 border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-300" aria-hidden="true" />
        <h2 className="font-display text-sm font-semibold text-rose-900 dark:text-rose-200">
          {t('profile.danger.confirm_title')}
        </h2>
      </div>
      <p className="mt-2 text-sm text-rose-800/90 dark:text-rose-100/80">
        {t('profile.danger.confirm_help', { word: confirmWord })}
      </p>

      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={t('profile.danger.confirm_placeholder')}
        autoComplete="off"
        autoCapitalize="characters"
        aria-label={t('profile.danger.confirm_help', { word: confirmWord })}
        className="mt-3 w-full rounded-xl border bg-white px-4 py-3 text-base font-medium tracking-wide text-navy-900 placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
      />

      {errorMessage && (
        <p role="alert" className="mt-2 text-meta font-medium text-rose-700 dark:text-rose-300">
          {errorMessage}
        </p>
      )}

      <div className="mt-4 flex gap-2.5">
        <Button
          variant="ghost"
          size="md"
          fullWidth
          disabled={mutation.isPending}
          onClick={() => {
            setPhase('idle')
            setTyped('')
            mutation.reset()
          }}
        >
          {t('profile.danger.cancel')}
        </Button>
        <Button
          variant="destructive"
          size="md"
          fullWidth
          disabled={!typedMatches}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? t('profile.danger.deleting') : t('profile.danger.confirm_btn')}
        </Button>
      </div>
    </section>
  )
}
