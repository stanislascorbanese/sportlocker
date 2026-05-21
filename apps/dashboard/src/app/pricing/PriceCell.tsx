'use client'

import { useState, useTransition } from 'react'

import { cn } from '../../lib/cn'
import { upsertPricingRuleAction, deletePricingRuleAction } from './_actions'
import type { SlotDurationMinutes } from '../../lib/api'

type Props = {
  itemTypeId: string
  durationMinutes: SlotDurationMinutes
  /** Prix initial en cents, ou null si aucune règle n'existe encore. */
  initialPriceCents: number | null
  /** ID de la règle si elle existe (pour la suppression). */
  ruleId: string | null
}

/**
 * Cellule de la matrice tarifaire. L'admin tape un montant en € (1 décimale
 * max). À la perte de focus :
 *   - vide → DELETE de la règle (le slot disparaît pour ce sport)
 *   - valeur valide → PUT upsert sur le triplet
 *   - valeur invalide → reset à l'initial + petite bordure rouge
 *
 * On utilise `useTransition` pour bloquer les autres edits tant que le
 * serveur ne répond pas, et `revalidateTag('pricing-rules')` côté action
 * force le re-fetch côté serveur sans full reload.
 */
export function PriceCell(props: Props) {
  const [draft, setDraft] = useState<string>(
    props.initialPriceCents === null ? '' : (props.initialPriceCents / 100).toFixed(2).replace(/\.?0+$/, ''),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function commit() {
    setError(null)
    const trimmed = draft.trim().replace(',', '.')

    if (trimmed === '') {
      // Vide → supprimer la règle si elle existait.
      if (props.ruleId === null) return  // rien à faire
      startTransition(async () => {
        const fd = new FormData()
        fd.set('id', props.ruleId!)
        const res = await deletePricingRuleAction(fd)
        if (res.status === 'error') {
          setError(res.message ?? 'error')
          setDraft(props.initialPriceCents === null ? '' : (props.initialPriceCents / 100).toFixed(2))
        }
      })
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('invalid')
      setDraft(props.initialPriceCents === null ? '' : (props.initialPriceCents / 100).toFixed(2))
      return
    }
    const cents = Math.round(parsed * 100)
    if (cents === props.initialPriceCents) return  // pas de changement

    startTransition(async () => {
      const fd = new FormData()
      fd.set('itemTypeId', props.itemTypeId)
      fd.set('durationMinutes', String(props.durationMinutes))
      fd.set('priceCents', String(cents))
      const res = await upsertPricingRuleAction(fd)
      if (res.status === 'error') {
        setError(res.message ?? 'error')
        setDraft(props.initialPriceCents === null ? '' : (props.initialPriceCents / 100).toFixed(2))
      }
    })
  }

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(props.initialPriceCents === null ? '' : (props.initialPriceCents / 100).toFixed(2))
            e.currentTarget.blur()
          }
        }}
        placeholder="—"
        disabled={isPending}
        aria-label={`Prix ${props.durationMinutes} min en euros`}
        className={cn(
          'w-20 rounded-md border bg-zinc-900/60 px-2 py-1 text-right text-sm tabular-nums',
          'transition-colors focus:outline-none focus:ring-1',
          error
            ? 'border-rose-500/60 text-rose-300 focus:border-rose-500 focus:ring-rose-500/30'
            : 'border-zinc-700/60 text-zinc-100 focus:border-sky-500 focus:ring-sky-500/30',
          isPending && 'opacity-50',
        )}
      />
      {draft !== '' && !error && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€</span>
      )}
    </div>
  )
}
