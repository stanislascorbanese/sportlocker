'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { pricingStrings } from '../../lib/i18n/pricing'
import { applyTemplateAction } from './_actions'
import { PRICING_TEMPLATES } from './templates'

/**
 * 3 cards de templates. Click → confirme (les règles existantes sur les mêmes
 * triplets seront écrasées) → POST /v1/admin/pricing-rules/bulk. Le
 * `router.refresh()` côté client force Next.js à re-render le Server
 * Component parent → la matrice reflète l'état serveur réel (le seul
 * `revalidateTag('pricing-rules')` côté action ne suffit pas).
 */
export function ApplyTemplate({ communeId, lang }: { communeId: string | null; lang: Lang }) {
  const router = useRouter()
  const t = pricingStrings(lang)
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
        const countStr = res.message?.match(/^(\d+)_rules_applied$/)?.[1]
        const count = countStr ? parseInt(countStr, 10) : null
        setFeedback({
          kind: 'ok',
          msg: count !== null
            ? `${count} ${count > 1 ? t.feedbackRulesAppliedMany : t.feedbackRulesApplied1}`
            : t.feedbackApplied,
        })
        router.refresh()
      } else {
        setFeedback({
          kind: 'err',
          msg: res.message === 'no_matching_item_types'
            ? t.feedbackNoMatch
            : (res.message ?? t.feedbackError),
        })
      }
      setConfirming(null)
    })
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-100">{t.templateTitle}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{t.templateSubtitle}</p>
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PRICING_TEMPLATES.map((tpl) => {
          const isConfirming = confirming === tpl.id
          return (
            <div
              key={tpl.id}
              className="flex flex-col justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3"
            >
              <div>
                <div className="text-sm font-medium text-zinc-100">{tpl.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{tpl.description}</p>
              </div>
              {isConfirming ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => apply(tpl.id)}
                    disabled={pending}
                    className="flex-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-40"
                  >
                    {t.btnOverridePrices}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={pending}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800/60"
                  >
                    {t.btnCancel}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(tpl.id)}
                  disabled={pending}
                  className="rounded-md border border-zinc-700 bg-zinc-800/40 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800/80 disabled:opacity-40"
                >
                  {t.btnApplyTemplate}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
