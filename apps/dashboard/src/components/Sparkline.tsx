import type { DailyPoint } from '../lib/api'
import type { Lang } from '../lib/lang'

const BAR_GAP = 4
const SVG_HEIGHT = 64
const LABEL_HEIGHT = 14
const BAR_AREA = SVG_HEIGHT - LABEL_HEIGHT

const WEEKDAYS: Record<Lang, [string, string, string, string, string, string, string]> = {
  fr: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
}

const STRINGS: Record<Lang, {
  noData: string
  reservations: string
  reservation1: string
  day1: string
  dayMany: string
  avgPerDay: string
  aria: (csv: string) => string
}> = {
  fr: {
    noData: 'aucune donnée',
    reservations: 'réservations',
    reservation1: 'réservation',
    day1: 'jour',
    dayMany: 'jours',
    avgPerDay: 'moy.',
    aria: (csv) => `Réservations par jour : ${csv}`,
  },
  en: {
    noData: 'no data',
    reservations: 'reservations',
    reservation1: 'reservation',
    day1: 'day',
    dayMany: 'days',
    avgPerDay: 'avg.',
    aria: (csv) => `Reservations per day: ${csv}`,
  },
}

/**
 * Bar chart compact, 1 barre par jour. SVG inline — pas de dépendance.
 *
 * `width` est ici interprété comme le viewBox interne (largeur "design") :
 * en pratique l'SVG s'étire pour remplir son conteneur jusqu'à `width` max,
 * via `max-w-full` + `preserveAspectRatio`.
 *
 * `lang` optionnel (défaut 'fr' pour rétro-compat) : header + tooltips +
 * aria-label localisés. Weekday letters dans la langue choisie.
 */
export function Sparkline({
  points,
  width = 360,
  lang = 'fr',
}: {
  points: DailyPoint[]
  width?: number
  lang?: Lang
}) {
  const s = STRINGS[lang]
  const wd = WEEKDAYS[lang]

  if (points.length === 0) {
    return <div className="text-xs text-white/40">{s.noData}</div>
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
          {s.reservations} · {n} {n > 1 ? s.dayMany : s.day1} · {s.avgPerDay} {avg.toFixed(1)}/{lang === 'fr' ? 'j' : 'd'}
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
        aria-label={s.aria(points.map((p) => `${p.date} ${p.count}`).join(', '))}
      >
        {points.map((p, i) => {
          const barH = Math.max(2, (p.count / max) * BAR_AREA)
          const x = i * (barWidth + BAR_GAP)
          const y = BAR_AREA - barH
          const d = new Date(p.date)
          const dow = wd[d.getUTCDay()] ?? '?'
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
                <title>{`${p.date} — ${p.count} ${p.count > 1 ? s.reservations : s.reservation1}`}</title>
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
