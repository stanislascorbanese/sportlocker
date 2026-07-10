'use client'

import { useQuery } from '@tanstack/react-query'
import { Info, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { fetchMe } from '../../lib/api'
import { useT } from '../../lib/i18n/I18nProvider'
import type { MessageKey } from '../../lib/i18n/messages'

/**
 * Badge "score de confiance" affiché sur /profile.
 *
 * Seuils (cf. cahier des charges) :
 *   - ≥ 80 → vert (success)   : excellent
 *   - 50–79 → orange (warning) : correct
 *   - < 50 → rouge (danger)    : fragile
 *
 * Le tooltip explique comment le score évolue (retard = pénalité, retours à
 * l'heure = remontée). Sur mobile il n'y a pas de hover : on le rend accessible
 * via un bouton "i" qui déplie l'explication (aria-expanded).
 *
 * La query partage la clé `['me']` avec la section suppression de compte —
 * React Query dédoublonne le GET /v1/users/me (un seul appel réseau).
 */
function toneFor(score: number): { tone: BadgeTone; levelKey: MessageKey } {
  if (score >= 80) return { tone: 'success', levelKey: 'profile.trust.level.high' }
  if (score >= 50) return { tone: 'warning', levelKey: 'profile.trust.level.mid' }
  return { tone: 'danger', levelKey: 'profile.trust.level.low' }
}

export function TrustScoreBadge() {
  const t = useT()
  const [open, setOpen] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    staleTime: 60 * 1000,
  })

  // On masque silencieusement la section en cas d'erreur : le score de confiance
  // est une info secondaire, inutile d'afficher un bloc d'erreur bloquant.
  if (isError) return null

  const { tone, levelKey } = data ? toneFor(data.trustScore) : { tone: 'neutral' as BadgeTone, levelKey: 'profile.trust.level.mid' as MessageKey }

  return (
    <section className="rounded-card border p-5 border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-gray-500 dark:text-white/60" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-navy-900/80 dark:text-white/80">
            {t('profile.trust.label')}
          </h2>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={t('profile.trust.tooltip')}
            className="rounded-full p-0.5 text-gray-400 transition-colors duration-base hover:text-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:text-white/40 dark:hover:text-emerald-300"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {isLoading ? (
          <Skeleton width={72} height={22} rounded="full" />
        ) : data ? (
          <Badge
            tone={tone}
            size="sm"
            aria-label={t('profile.trust.aria', { score: data.trustScore })}
          >
            {data.trustScore} · {t(levelKey)}
          </Badge>
        ) : null}
      </div>

      {open && (
        <p className="mt-3 text-meta text-gray-600 dark:text-white/60">
          {t('profile.trust.tooltip')}
        </p>
      )}
    </section>
  )
}
