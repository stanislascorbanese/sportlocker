import type { DailyPoint } from '../lib/api'

const BAR_GAP = 4
const SVG_HEIGHT = 64
const LABEL_HEIGHT = 14
const BAR_AREA = SVG_HEIGHT - LABEL_HEIGHT

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/**
 * Bar chart compact, 1 barre par jour. SVG inline — pas de dépendance.
 *
 * `width` est ici interprété comme le viewBox interne (largeur "design") :
 * en pratique l'SVG s'étire pour remplir son conteneur jusqu'à `width` max,
 * via `max-w-full` + `preserveAspectRatio`. Sur mobile, on shrink — sur
 * desktop on garde la taille nominale.
 */
export function Sparkline({
  points,
  width = 360,
}: {
  points: DailyPoint[]
  width?: number
}) {
  if (points.length === 0) {
    return <div className="text-xs text-white/40">aucune donnée</div>
  }

  const max = Math.max(1, ...points.map((p) => p.count))
  const total = points.reduce((a, p) => a + p.count, 0)
  const avg = total / points.length

  const n = points.length
  const barWidth = (width - BAR_GAP * (n - 1)) / n

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-display text-2xl tabular-nums text-white">{total}</span>
        <span className="text-xs text-white/55">
          réservations · {n} jour{n > 1 ? 's' : ''} · moy. {avg.toFixed(1)}/j
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={SVG_HEIGHT}
        style={{ maxWidth: `${width}px` }}
        className="block h-16 w-full"
        role="img"
        aria-label={`Réservations par jour: ${points.map((p) => `${p.date} ${p.count}`).join(', ')}`}
      >
        {points.map((p, i) => {
          const barH = Math.max(2, (p.count / max) * BAR_AREA)
          const x = i * (barWidth + BAR_GAP)
          const y = BAR_AREA - barH
          const d = new Date(p.date)
          const dow = WEEKDAYS[d.getUTCDay()] ?? '?'
          return (
            <g key={p.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barH}
                rx={2}
                className="fill-emerald-500/70 transition hover:fill-emerald-400"
              >
                <title>{`${p.date} — ${p.count} réservation${p.count > 1 ? 's' : ''}`}</title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={SVG_HEIGHT - 2}
                textAnchor="middle"
                className="fill-white/40 text-[10px]"
              >
                {dow}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
