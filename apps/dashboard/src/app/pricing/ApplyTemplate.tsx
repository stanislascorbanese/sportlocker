'use client'

import { useState, useTransition } from 'react'

import { cn } from '../../lib/cn'
import { applyTemplateAction } from './_actions'
import { PRICING_TEMPLATES } from './templates'

/**
 * 3 cards de templates. Click → confirme (les règles existantes sur les mêmes
 * triplets seront écrasées) → POST /v1/admin/pricing-rules/bulk. Le revalidate
 * côté action force le refresh de la matrice.
 */
export function ApplyTemplate({ communeId }: { communeId: string | null }) {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  function apply(templateId: string) {
    setFeedback(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('templateId', templateId)
      if (communeId) fd.set('communeId', communeId)
      const res = await applyTemplateAction(fd)
      if (res.status === 'success') {
        const count = res.message?.match(/^(\d+)_rules_applied$/)?.[1]
        setFeedback({ kind: 'ok', msg: count ? `${count} règle(s) appliquée(s)` : 'Template appliqué' })
      } else {
        setFeedback({
          kind: 'err',
          msg: res.message === 'no_matching_item_types'
            ? 'Ce template ne matche aucun de vos item_types existants. Saisissez les prix à la main dans la matrice ci-dessous, ou créez des item_types nommés ex. "raquette tennis", "ballon foot" pour qu\'ils matchent les catégories du template.'
            : (res.message ?? 'Erreur'),
        })
      }
      setConfirming(null)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">Démarrer avec un template</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Le matching item_type ↔ template se fait par substring sur catégorie/nom. Les prix existants
            sur les mêmes triplets seront écrasés.
          </p>
        </div>
        {feedback && (
          <div className={cn(
            'rounded-md border px-2.5 py-1 text-xs',
            feedback.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300',
          )}>{feedback.msg}</div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PRICING_TEMPLATES.map((t) => {
          const isConfirming = confirming === t.id
          return (
            <div
              key={t.id}
              className="flex flex-col justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3"
            >
              <div>
                <div className="text-sm font-medium text-zinc-100">{t.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t.description}</p>
              </div>
              {isConfirming ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => apply(t.id)}
                    disabled={pending}
                    className="flex-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    Écraser les prix
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={pending}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800/60"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(t.id)}
                  disabled={pending}
                  className="rounded-md border border-zinc-700 bg-zinc-800/40 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-40"
                >
                  Appliquer ce template
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
