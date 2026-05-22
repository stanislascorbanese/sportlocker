import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LOCATIONS_PER_DIST_PER_DAY,
  PRICING,
  SIZING,
  computeSimulation,
  recommendDistributors,
  type TenantSegment,
} from '@/data/site'

// Pré-remplissage depuis les query params — utilisé quand on arrive depuis le
// MiniSimulator de la home (?type=mairie&size=12000#simulateur).
function readInitialState(): { segment: TenantSegment; size: number } {
  const fallback = { segment: 'mairie' as TenantSegment, size: SIZING.mairie.defaultSize }
  if (typeof window === 'undefined') return fallback
  const params = new URLSearchParams(window.location.search)
  const t = params.get('type')
  const segment: TenantSegment =
    t === 'mairie' || t === 'camping' || t === 'hotel' ? t : 'mairie'
  const cfg = SIZING[segment]
  const parsed = parseInt(params.get('size') ?? '', 10)
  const size = Number.isFinite(parsed)
    ? Math.min(cfg.maxSize, Math.max(cfg.minSize, parsed))
    : cfg.defaultSize
  return { segment, size }
}

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

// KPI principaux : arrondi au 100 € supérieur + préfixe « ≈ » pour rester honnête
// sur l'incertitude (subventions estimées, ramp-up locations).
const formatEurApprox = (n: number): string =>
  '≈ ' + formatEur(Math.ceil(n / 100) * 100)

// Per-unit (€/habitant/an, €/chambre/an…) : 0 décimale ≥ 10 €, 1 décimale sous 10 €.
const formatPerUnit = (n: number): string => formatEur(n, n >= 10 ? 0 : 1)

const formatInt = (n: number): string => new Intl.NumberFormat('fr-FR').format(n)

export default function PriceCalculator(): JSX.Element {
  const initial = useMemo(readInitialState, [])
  const [segment, setSegment] = useState<TenantSegment>(initial.segment)
  const [size, setSize] = useState<number>(initial.size)
  const [count, setCount] = useState<number>(recommendDistributors(initial.segment, initial.size))
  const [countOverridden, setCountOverridden] = useState(false)

  // On préserve l'état initial venu de l'URL — l'effect de reset ne s'applique
  // qu'aux changements de segment ultérieurs (clic utilisateur).
  const isFirstSegmentRun = useRef(true)
  useEffect(() => {
    if (isFirstSegmentRun.current) {
      isFirstSegmentRun.current = false
      return
    }
    const cfg = SIZING[segment]
    setSize(cfg.defaultSize)
    setCount(recommendDistributors(segment, cfg.defaultSize))
    setCountOverridden(false)
  }, [segment])

  // Quand on change la taille, on garde l'override utilisateur si actif.
  useEffect(() => {
    if (!countOverridden) setCount(recommendDistributors(segment, size))
  }, [segment, size, countOverridden])

  const cfg = PRICING[segment]
  const sizing = SIZING[segment]

  const result = useMemo(() => computeSimulation(segment, size, count), [segment, size, count])

  const handleCountChange = (next: number): void => {
    setCountOverridden(true)
    setCount(Math.max(1, Math.min(sizing.maxDistributors * 2, next)))
  }

  const resetCount = (): void => {
    setCountOverridden(false)
    setCount(recommendDistributors(segment, size))
  }

  // Pré-remplissage du formulaire /contact : type + nb dist + récap simulation.
  const recap = [
    `Simulation tarifs.fr — ${segment}, ${formatInt(size)} ${sizing.unit}, ${count} distributeur${count > 1 ? 's' : ''}.`,
    `Budget année 1 (setup${segment === 'mairie' && result.subsidyAmount > 0 ? ' inclus, subventions estimées déduites' : ' inclus'}) : ${formatEurApprox(result.yearOneBudget)}.`,
    `Vitesse de croisière (année 2+) : ${
      result.steadyAnnualBalance > 0
        ? formatEurApprox(result.steadyAnnualBalance) + '/an net'
        : 'locations couvrent l\'abo, surplus ' + formatEurApprox(result.steadySurplus) + '/an'
    }.`,
  ].join('\n')
  const contactHref =
    `/contact?type=${segment}&dist=${count}&size=${size}` +
    `&prefill=${encodeURIComponent(recap)}`

  return (
    <div className="card-dark p-7 sm:p-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <span className="tag tag-brand text-[0.7rem] py-1 px-2.5">Simulateur · 30 sec</span>
        <span className="text-[0.7rem] text-white/35 italic">Résultats indicatifs HT</span>
      </div>

      {/* STEP 1 — Type de site */}
      <div className="mb-7">
        <label className="block text-xs uppercase tracking-[0.12em] text-white/40 mb-3">
          1 · Vous êtes
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
      </div>

      {/* STEP 2 — Taille du site */}
      <div className="mb-7">
        <div className="flex justify-between items-baseline mb-3">
          <label
            htmlFor="size"
            className="text-xs uppercase tracking-[0.12em] text-white/40"
          >
            2 · Taille du site — {sizing.unit}
          </label>
          <span className="font-extrabold text-2xl text-white tabular-nums">
            {formatInt(size)}
          </span>
        </div>
        <input
          id="size"
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

      {/* STEP 3 — Distributeurs (auto-recommandé, ajustable) */}
      <div className="mb-7">
        <div className="flex justify-between items-baseline mb-3 gap-2">
          <label className="text-xs uppercase tracking-[0.12em] text-white/40">
            3 · Distributeurs
            {!countOverridden && (
              <span className="ml-2 text-[0.65rem] normal-case tracking-normal text-brand-400 font-normal">
                · recommandé pour votre taille
              </span>
            )}
            {countOverridden && (
              <button
                type="button"
                onClick={resetCount}
                className="ml-2 text-[0.65rem] normal-case tracking-normal text-brand-400 hover:text-brand-500 underline underline-offset-2 font-normal"
              >
                · réinitialiser la reco
              </button>
            )}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleCountChange(count - 1)}
            disabled={count <= 1}
            aria-label="Diminuer le nombre de distributeurs"
            className="h-11 w-11 rounded-lg bg-white/5 border border-white/10 text-white text-xl font-medium hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <div className="flex-1 text-center bg-black/20 rounded-lg py-2.5">
            <span className="font-extrabold text-2xl text-white tabular-nums">{count}</span>
            <span className="text-white/45 text-sm ml-2">
              distributeur{count > 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleCountChange(count + 1)}
            aria-label="Augmenter le nombre de distributeurs"
            className="h-11 w-11 rounded-lg bg-white/5 border border-white/10 text-white text-xl font-medium hover:bg-white/10 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* RÉSULTAT — 2 KPIs côte à côte */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {/* KPI 1 — Budget année 1 (à voter au conseil) */}
        <div className="bg-gradient-to-br from-brand-500/15 to-brand-700/10 border border-brand-500/40 rounded-xl p-5 sm:p-6">
          <div className="text-[0.65rem] uppercase tracking-[0.12em] text-brand-400 mb-2">
            {segment === 'mairie' ? 'Budget année 1 · à voter' : 'Budget année 1'}
          </div>
          <div className="font-extrabold text-3xl sm:text-4xl text-white tabular-nums">
            {formatEurApprox(result.yearOneBudget)}
          </div>
          <div className="text-xs text-white/55 mt-1.5 font-light">
            soit{' '}
            <strong className="text-white/80 font-medium">
              {formatPerUnit(result.yearOnePerUnit)} / {sizing.unitShort} / an
            </strong>
          </div>
        </div>

        {/* KPI 2 — Croisière */}
        <div className="bg-accent-500/10 border border-accent-500/30 rounded-xl p-5 sm:p-6">
          <div className="text-[0.65rem] uppercase tracking-[0.12em] text-accent-500 mb-2">
            Croisière année 2+
          </div>
          {result.steadyAnnualBalance > 0 ? (
            <>
              <div className="font-extrabold text-3xl sm:text-4xl text-white tabular-nums">
                {formatEurApprox(result.steadyAnnualBalance)}
              </div>
              <div className="text-xs text-white/55 mt-1.5 font-light">
                net annuel après revenu locations matures
              </div>
            </>
          ) : (
            <>
              <div className="font-extrabold text-2xl sm:text-3xl text-white">
                Auto-financé
              </div>
              <div className="text-xs text-white/65 mt-1.5 font-light">
                + surplus locations{' '}
                <strong className="text-accent-500 font-semibold tabular-nums">
                  {formatEurApprox(result.steadySurplus)}/an
                </strong>{' '}
                reversé via Stripe Connect
              </div>
            </>
          )}
        </div>
      </div>

      {/* BREAKDOWN — détail année 1 */}
      <div className="card-dark bg-white/[0.02] p-5 sm:p-6 mb-6">
        <div className="text-xs uppercase tracking-[0.12em] text-white/40 mb-4">
          Détail du budget année 1
        </div>
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-white/65 font-light">
              Abonnement SaaS
              <span className="text-white/35 text-xs ml-1">
                ({formatEur(cfg.monthlyPerDist)}/mois × {count} × 12)
              </span>
            </dt>
            <dd className="text-white tabular-nums font-medium">
              {formatEur(result.annualSubscription)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-white/65 font-light">
              Setup one-shot
              <span className="text-white/35 text-xs ml-1">
                (installation + activation)
              </span>
            </dt>
            <dd className="text-white tabular-nums font-medium">
              {formatEur(result.setupOneShot)}
            </dd>
          </div>
          {segment === 'mairie' && result.subsidyAmount > 0 && (
            <div className="flex justify-between gap-3">
              <dt className="text-accent-500 font-light">
                − Subventions estimées
                <span className="text-white/35 text-xs ml-1">
                  (ANS / DETR / DSIL ~{result.subsidyRatePct} %)
                </span>
              </dt>
              <dd className="text-accent-500 tabular-nums font-medium">
                − {formatEur(result.subsidyAmount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 pt-3 mt-2 border-t border-white/10">
            <dt className="text-white font-medium">= Budget à provisionner année 1</dt>
            <dd className="text-white tabular-nums font-extrabold">
              {formatEur(result.yearOneBudget)}
            </dd>
          </div>
        </dl>
        <p className="text-[0.7rem] text-white/40 italic leading-relaxed mt-4 pt-4 border-t border-white/5">
          Les locations citoyens ({formatInt(LOCATIONS_PER_DIST_PER_DAY)} loc/jour/dist à pleine charge × 75 % reversés,
          panier moyen indicatif — vous fixez votre grille via /pricing) ne sont pas comptabilisées en année 1 :
          l'usage met 12 à 18 mois à monter en charge. En croisière, le revenu mature atteint{' '}
          <strong className="text-white/65 font-normal">
            {formatEur(result.annualLocationRevenueMature)}/an
          </strong>.
        </p>
      </div>

      {/* PAYBACK + ENGAGEMENT */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="text-[0.65rem] uppercase tracking-[0.12em] text-white/40 mb-1.5">
            Payback locations
          </div>
          <div className="font-extrabold text-xl text-white tabular-nums">
            {result.paybackMonths === null
              ? 'au-delà du contrat'
              : result.paybackMonths === 0
                ? 'dès la mise en service'
                : `${result.paybackMonths} mois`}
          </div>
          <div className="text-[0.7rem] text-white/40 mt-1 font-light">
            quand les locations couvrent le setup + l'abonnement
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <div className="text-[0.65rem] uppercase tracking-[0.12em] text-white/40 mb-1.5">
            Engagement
          </div>
          <div className="font-extrabold text-xl text-white tabular-nums">
            {cfg.commitMonths} mois
          </div>
          <div className="text-[0.7rem] text-white/40 mt-1 font-light">
            matériel + maintenance + OTA inclus
          </div>
        </div>
      </div>

      <a href={contactHref} className="btn btn-primary w-full">
        Recevoir mon devis chiffré →
      </a>
      <p className="text-[0.7rem] text-white/30 text-center mt-3 italic leading-relaxed px-2">
        {segment === 'mairie'
          ? 'Subventions ANS / DETR / DSIL : estimation indicative basée sur les barèmes publics 2025. Taux réel confirmé en instruction par votre service finance et le Conseil départemental.'
          : 'Revenu locations dépend du taux d\'utilisation réel, qui prend plusieurs mois à monter en charge. Tarif final selon configuration et options.'}
      </p>
    </div>
  )
}
