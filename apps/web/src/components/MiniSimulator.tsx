import { useEffect, useMemo, useState } from 'react'
import {
  SIZING,
  computeSimulation,
  recommendDistributors,
  type TenantSegment,
} from '@/data/site'

const segments: { value: TenantSegment; label: string; emoji: string }[] = [
  { value: 'mairie', label: 'Mairie', emoji: '🏛️' },
  { value: 'camping', label: 'Camping', emoji: '⛺' },
  { value: 'hotel', label: 'Hôtel', emoji: '🏨' },
]

const formatEur = (n: number, fractionDigits = 0): string =>
  new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(Math.round(n * 10 ** fractionDigits) / 10 ** fractionDigits) + ' €'

const formatEurApprox = (n: number): string =>
  '≈ ' + formatEur(Math.ceil(n / 100) * 100)

const formatPerUnit = (n: number): string => formatEur(n, n >= 10 ? 0 : 1)

const formatInt = (n: number): string => new Intl.NumberFormat('fr-FR').format(n)

export default function MiniSimulator(): JSX.Element {
  const [segment, setSegment] = useState<TenantSegment>('mairie')
  const [size, setSize] = useState<number>(SIZING.mairie.defaultSize)

  useEffect(() => {
    setSize(SIZING[segment].defaultSize)
  }, [segment])

  const sizing = SIZING[segment]
  const count = recommendDistributors(segment, size)
  const result = useMemo(() => computeSimulation(segment, size, count), [segment, size, count])

  const detailHref = `/tarifs?type=${segment}&size=${size}#simulateur`

  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-stretch">
      {/* Inputs */}
      <div className="card-dark p-6 sm:p-7">
        <div className="grid grid-cols-3 gap-2 p-1 bg-black/20 rounded-lg mb-6">
          {segments.map((s) => {
            const active = s.value === segment
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSegment(s.value)}
                className={
                  'py-2.5 px-3 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ' +
                  (active
                    ? 'bg-brand-500 text-white'
                    : 'text-white/65 hover:text-white hover:bg-white/5')
                }
                aria-pressed={active}
              >
                <span aria-hidden="true">{s.emoji}</span>
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>

        <div className="mb-2">
          <div className="flex justify-between items-baseline mb-3">
            <label
              htmlFor="mini-size"
              className="text-xs uppercase tracking-[0.12em] text-white/40"
            >
              {sizing.unit}
            </label>
            <span className="font-extrabold text-2xl text-white tabular-nums">
              {formatInt(size)}
            </span>
          </div>
          <input
            id="mini-size"
            type="range"
            min={sizing.minSize}
            max={sizing.maxSize}
            step={sizing.minSize >= 100 ? 100 : 10}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10))}
            className="w-full accent-brand-500"
            aria-label={`Nombre d'${sizing.unit}`}
          />
          <div className="flex justify-between text-[0.7rem] text-white/30 mt-1">
            <span>{formatInt(sizing.minSize)}</span>
            <span>{formatInt(sizing.maxSize)}</span>
          </div>
        </div>

        <div className="text-xs text-white/45 mt-5 font-light leading-relaxed">
          On recommande{' '}
          <strong className="text-white/80 font-medium tabular-nums">
            {count} distributeur{count > 1 ? 's' : ''}
          </strong>{' '}
          pour votre taille — ajustable sur la page tarifs.
        </div>
      </div>

      {/* Résultat */}
      <div className="bg-gradient-to-br from-brand-500/20 to-brand-700/10 border border-brand-500/40 rounded-2xl p-6 sm:p-7 flex flex-col">
        <div className="text-[0.65rem] uppercase tracking-[0.12em] text-brand-400 mb-2">
          {segment === 'mairie' ? 'Budget année 1 · à voter' : 'Budget année 1'}
        </div>
        <div className="font-extrabold text-4xl sm:text-5xl text-white tabular-nums tracking-tight">
          {formatEurApprox(result.yearOneBudget)}
        </div>
        <div className="text-sm text-white/65 mt-1.5 font-light">
          soit{' '}
          <strong className="text-white/90 font-medium">
            {formatPerUnit(result.yearOnePerUnit)} / {sizing.unitShort} / an
          </strong>
          {segment === 'mairie' && result.subsidyRatePct > 0 && (
            <span className="text-white/45">
              {' '}
              · subventions ANS/DETR ~{result.subsidyRatePct} % déduites
            </span>
          )}
        </div>

        <div className="mt-5 pt-5 border-t border-white/10 text-xs text-white/55 font-light leading-relaxed">
          <span className="text-accent-500 font-medium">Année 2+</span> :
          les locations citoyens couvrent l'abonnement et génèrent{' '}
          <strong className="text-white/85 font-medium tabular-nums">
            {formatEurApprox(result.steadySurplus)}/an
          </strong>{' '}
          d'excédent reversé via Stripe Connect.
        </div>

        <div className="flex-1" />

        <a href={detailHref} className="btn btn-primary w-full mt-6">
          Voir la simulation détaillée →
        </a>
      </div>
    </div>
  )
}
