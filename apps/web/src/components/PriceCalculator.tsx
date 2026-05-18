import { useMemo, useState } from 'react'
import { PRICING, type TenantSegment } from '@/data/site'

const segments: { value: TenantSegment; label: string }[] = [
  { value: 'mairie', label: 'Mairie' },
  { value: 'camping', label: 'Camping' },
  { value: 'autre', label: 'Hôtel / autre' },
]

const formatEur = (n: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' €'

export default function PriceCalculator(): JSX.Element {
  const [segment, setSegment] = useState<TenantSegment>('mairie')
  const [count, setCount] = useState<number>(4)

  const { monthly, setup, commit, annual } = useMemo(() => {
    const cfg = PRICING[segment]
    const m = cfg.monthlyPerDist * count
    const s = cfg.setupPerDist * count
    return {
      monthly: m,
      setup: s,
      commit: cfg.commitMonths,
      annual: m * 12,
    }
  }, [segment, count])

  return (
    <div className="card-dark p-7 sm:p-10 max-w-3xl mx-auto">
      <div className="mb-7">
        <label className="block text-xs uppercase tracking-[0.12em] text-white/40 mb-3">
          Type de site
        </label>
        <div className="grid grid-cols-3 gap-2 p-1 bg-black/20 rounded-lg">
          {segments.map((s) => {
            const active = s.value === segment
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSegment(s.value)}
                className={
                  'py-2.5 px-3 rounded-md text-sm font-medium transition-colors ' +
                  (active
                    ? 'bg-brand-500 text-white'
                    : 'text-white/65 hover:text-white hover:bg-white/5')
                }
                aria-pressed={active}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-9">
        <div className="flex justify-between items-baseline mb-3">
          <label
            htmlFor="count"
            className="text-xs uppercase tracking-[0.12em] text-white/40"
          >
            Nombre de distributeurs
          </label>
          <span className="font-extrabold text-2xl text-white tabular-nums">
            {count}
          </span>
        </div>
        <input
          id="count"
          type="range"
          min={1}
          max={20}
          step={1}
          value={count}
          onChange={(e) => setCount(parseInt(e.target.value, 10))}
          className="w-full accent-brand-500"
          aria-label="Nombre de distributeurs"
        />
        <div className="flex justify-between text-[0.7rem] text-white/30 mt-1">
          <span>1</span>
          <span>10</span>
          <span>20</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-5">
          <div className="text-xs uppercase tracking-[0.12em] text-brand-500 mb-2">
            Abonnement mensuel HT
          </div>
          <div className="font-extrabold text-3xl text-white tabular-nums">
            {formatEur(monthly)}
          </div>
          <div className="text-xs text-white/40 mt-1.5">
            soit {formatEur(annual)} par an
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-5">
          <div className="text-xs uppercase tracking-[0.12em] text-white/40 mb-2">
            Setup one-shot HT
          </div>
          <div className="font-extrabold text-3xl text-white tabular-nums">
            {formatEur(setup)}
          </div>
          <div className="text-xs text-white/40 mt-1.5">
            installation + formation + activation
          </div>
        </div>
      </div>

      <ul className="space-y-2 text-sm text-white/55 mb-6">
        <li>· Engagement {commit} mois</li>
        <li>· Matériel sportif inclus, renouvellement compris</li>
        <li>· Maintenance, mises à jour OTA et hotline N2 incluses</li>
        <li>· Aucun coût citoyen — le service est gratuit pour vos usagers</li>
      </ul>

      <a href="/contact" className="btn btn-primary w-full">
        Recevoir un devis personnalisé →
      </a>
      <p className="text-[0.7rem] text-white/30 text-center mt-3 italic">
        Estimations indicatives. Tarif final selon configuration, distance et options.
      </p>
    </div>
  )
}
