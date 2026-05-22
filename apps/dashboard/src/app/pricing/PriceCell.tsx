'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

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
  /**
   * Override commune (super_admin uniquement). null = admin scopé, l'API
   * utilisera la session. Super_admin doit transmettre le communeId
   * sélectionné dans le picker pour passer le guard `commune_id_required`.
   */
  communeId: string | null
}

/**
 * Formate des cents en string lisible côté input (sans symbole €, le €
 * est rendu à part en absolu pour ne pas perturber l'édition) :
 *   50    → "0,50"
 *   100   → "1"
 *   150   → "1,50"
 *   2000  → "20"
 *   1234  → "12,34"
 * Virgule (et pas point) parce qu'on est en fr-FR.
 */
function formatCents(cents: number): string {
  const euros = cents / 100
  // toFixed(2) puis on retire les zéros de queue, mais on garde la virgule
  // si il reste des centimes significatifs.
  const fixed = euros.toFixed(2)
  // "0.50" → "0,5" ; "1.00" → "1" ; "1.50" → "1,5" — pas idéal, on veut
  // garder "0,50" pour la lisibilité. Donc on enlève seulement les zéros
  // ET le point quand TOUS les centimes sont à 0.
  const trimmed = fixed.endsWith('.00') ? fixed.slice(0, -3) : fixed
  return trimmed.replace('.', ',')
}

/**
 * Cellule de la matrice tarifaire. L'admin tape un montant en € (1 décimale
 * max). À la perte de focus :
 *   - vide → DELETE de la règle (le slot disparaît pour ce sport)
 *   - valeur valide → PUT upsert sur le triplet
 *   - valeur invalide → reset à l'initial + petite bordure rouge
 *
 * On utilise `useTransition` pour bloquer les autres edits tant que le
 * serveur ne répond pas. Le `router.refresh()` après succès force Next.js
 * à re-render le RSC parent → la matrice reflète l'état serveur réel
 * (le `revalidateTag('pricing-rules')` côté action ne suffit pas seul à
 * forcer le re-render du Server Component contenant).
 */
export function PriceCell(props: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<string>(
    props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Si le parent re-fetch (après router.refresh) et que `initialPriceCents`
  // change, on resynchronise le draft local. Sans ça l'edit local persiste
  // par-dessus l'état serveur.
  useEffect(() => {
    setDraft(props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents))
    setError(null)
  }, [props.initialPriceCents, props.ruleId])

  function commit() {
    setError(null)
    const trimmed = draft.trim().replace(',', '.')

    if (trimmed === '') {
      // Vide → supprimer la règle si elle existait.
      if (props.ruleId === null) return  // rien à faire
      startTransition(async () => {
        const fd = new FormData()
        fd.set('id', props.ruleId!)
        if (props.communeId) fd.set('communeId', props.communeId)
        const res = await deletePricingRuleAction(fd)
        if (res.status === 'error') {
          setError(res.message ?? 'error')
          setDraft(props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents))
          return
        }
        router.refresh()
      })
      return
    }

    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError('invalid')
      setDraft(props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents))
      return
    }
    const cents = Math.round(parsed * 100)
    if (cents === props.initialPriceCents) return  // pas de changement

    startTransition(async () => {
      const fd = new FormData()
      fd.set('itemTypeId', props.itemTypeId)
      fd.set('durationMinutes', String(props.durationMinutes))
      fd.set('priceCents', String(cents))
      if (props.communeId) fd.set('communeId', props.communeId)
      const res = await upsertPricingRuleAction(fd)
      if (res.status === 'error') {
        setError(res.message ?? 'error')
        setDraft(props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents))
        return
      }
      router.refresh()
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
            setDraft(props.initialPriceCents === null ? '' : formatCents(props.initialPriceCents))
            e.currentTarget.blur()
          }
        }}
        placeholder="—"
        disabled={isPending}
        aria-label={`Prix ${props.durationMinutes} min en euros`}
        className={cn(
          // 6rem au lieu de 5rem pour laisser la place au "€" sans
          // chevauchement du nombre — utile pour 1234 (= 12,34 €).
          'w-24 rounded-md border bg-zinc-900/60 px-2 py-1 pr-6 text-right text-sm tabular-nums',
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
