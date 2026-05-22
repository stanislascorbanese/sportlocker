'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { cn } from '../../lib/cn'
import type { Commune } from '../../lib/api'

/**
 * Sélecteur de commune visible UNIQUEMENT pour super_admin sur /pricing.
 *
 * Les `pricing_rules` sont scopées commune en DB ; un super_admin doit
 * choisir explicitement la commune qu'il veut configurer (l'API exige
 * `?communeId=...` côté super_admin, scope null sinon = 422
 * `commune_id_required`).
 *
 * Pushé en query string pour rendre l'URL partageable (un autre super_admin
 * peut envoyer `/pricing?communeId=...` à un collègue).
 */
export function CommuneSelector({
  communes,
  currentCommuneId,
}: {
  communes: Commune[]
  currentCommuneId: string | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  function onChange(communeId: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('communeId', communeId)
    startTransition(() => {
      router.push(`/pricing?${params.toString()}`)
    })
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-3">
      <span className="text-xs font-medium uppercase tracking-wider text-emerald-300">
        Super-admin
      </span>
      <span className="text-sm text-zinc-400">·</span>
      <label className="text-sm text-zinc-300" htmlFor="commune-select">
        Tarif de la commune :
      </label>
      <select
        id="commune-select"
        value={currentCommuneId ?? ''}
        disabled={pending || communes.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100',
          'focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30',
          pending && 'opacity-50',
        )}
      >
        {communes.length === 0 && <option value="">Aucune commune disponible</option>}
        {currentCommuneId === null && communes.length > 0 && (
          <option value="" disabled>— Choisir une commune —</option>
        )}
        {communes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.postalCode})
          </option>
        ))}
      </select>
    </div>
  )
}
