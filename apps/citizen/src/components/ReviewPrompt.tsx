'use client'

import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, X } from 'lucide-react'
import { useState } from 'react'

import { ApiError, REVIEW_COMMENT_MAX, submitReview } from '../lib/api'
import { useT } from '../lib/i18n/I18nProvider'
import { Card } from './ui/Card'
import { StarRating } from './ui/StarRating'

/**
 * Carte "Comment c'était ?" affichée après un retour réussi (résa `returned`).
 *
 * Étoiles tactiles + commentaire optionnel. Dismissable : une fois l'avis
 * envoyé OU ignoré, on mémorise l'état dans localStorage (clé dérivée de l'id
 * de résa) pour ne plus jamais réafficher la carte pour cette réservation.
 */
const STORAGE_PREFIX = 'sportlocker_review:'

type DismissState = 'sent' | 'dismissed'

function readDismissState(reservationId: string): DismissState | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_PREFIX + reservationId)
    return v === 'sent' || v === 'dismissed' ? v : null
  } catch {
    return null
  }
}

function writeDismissState(reservationId: string, state: DismissState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + reservationId, state)
  } catch {
    // localStorage indisponible (private mode Safari) — pas critique : la carte
    // pourra réapparaître au prochain montage, ce qui reste acceptable.
  }
}

export function ReviewPrompt({ reservationId }: { reservationId: string }) {
  const t = useT()
  // État initial lu une seule fois : si déjà envoyé/ignoré, on ne rend rien.
  const [hidden, setHidden] = useState(() => readDismissState(reservationId) != null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  const mutation = useMutation({
    mutationFn: () => submitReview(reservationId, { rating, comment }),
    onSuccess: () => {
      writeDismissState(reservationId, 'sent')
    },
  })

  if (hidden) return null

  // Après un envoi réussi : coche de remerciement, la carte reste visible le
  // temps de l'affichage puis ne reviendra plus (localStorage='sent').
  if (mutation.isSuccess) {
    return (
      <Card variant="accent" className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2
          className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-navy-900 dark:text-white">
          {t('review.thanks_title')}
        </p>
        <p className="text-meta text-gray-600 dark:text-white/55">{t('review.thanks_body')}</p>
      </Card>
    )
  }

  const dismiss = () => {
    writeDismissState(reservationId, 'dismissed')
    setHidden(true)
  }

  const errorMessage = mutation.error
    ? mutation.error instanceof ApiError && mutation.error.code === 'review_already_exists'
      ? t('review.error.already')
      : t('review.error.generic')
    : null

  return (
    <Card variant="accent" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy-900 dark:text-white">
            {t('review.title')}
          </p>
          <p className="text-meta text-gray-600 dark:text-white/55">{t('review.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('review.dismiss')}
          className="-m-1 rounded-lg p-1 text-gray-400 transition-colors hover:text-gray-600 dark:text-white/40 dark:hover:text-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex justify-center">
        <StarRating
          value={rating}
          size="lg"
          onRate={setRating}
          ariaLabel={(n) => t('review.stars_aria', { count: n })}
        />
      </div>

      <div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
          maxLength={REVIEW_COMMENT_MAX}
          rows={3}
          placeholder={t('review.comment_placeholder')}
          className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
        />
        <p className="mt-1 text-right text-[11px] text-gray-400 dark:text-white/35">
          {comment.length}/{REVIEW_COMMENT_MAX}
        </p>
      </div>

      {errorMessage && (
        <p className="text-meta text-rose-700 dark:text-rose-300">{errorMessage}</p>
      )}

      <button
        type="button"
        disabled={rating === 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-base hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-navy-900 dark:hover:bg-emerald-400"
      >
        {mutation.isPending ? t('review.sending') : t('review.submit')}
      </button>
    </Card>
  )
}
