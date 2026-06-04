const SVG_HEIGHT = 96
const PAD_TOP = 8
const PAD_BOTTOM = 8

export type MetricPoint = { t: string; value: number | null }

type Tone = 'emerald' | 'sky' | 'amber' | 'violet'

const TONE: Record<Tone, { stroke: string; fill: string; text: string }> = {
  emerald: { stroke: 'stroke-emerald-400', fill: 'fill-emerald-500/10', text: 'text-emerald-300' },
  sky:     { stroke: 'stroke-sky-400',     fill: 'fill-sky-500/10',     text: 'text-sky-300' },
  amber:   { stroke: 'stroke-amber-400',   fill: 'fill-amber-500/10',   text: 'text-amber-300' },
  violet:  { stroke: 'stroke-violet-400',  fill: 'fill-violet-500/10',  text: 'text-violet-300' },
}

/**
 * Courbe de tendance d'une métrique télémétrique (température, RSSI, mémoire).
 * SVG inline — pas de dépendance graphique. Les trous (value null) coupent la
 * ligne en segments distincts au lieu d'interpoler.
 */
export function MetricChart({
  label,
  points,
  unit = '',
  tone = 'emerald',
  width = 520,
  decimals = 0,
}: {
  label: string
  points: MetricPoint[]
  unit?: string
  tone?: Tone
  width?: number
  decimals?: number
}) {
  const t = TONE[tone]
  const values = points.map((p) => p.value).filter((v): v is number => v != null)

  if (values.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{label}</h4>
        <p className="mt-4 text-xs text-white/40">aucune donnée sur la période</p>
      </div>
    )
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = points.length
  const innerH = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM

  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width)
  const y = (v: number) => PAD_TOP + innerH - ((v - min) / span) * innerH

  // Segments contigus de points non-null pour casser la ligne sur les trous.
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  points.forEach((p, i) => {
    if (p.value == null) {
      if (current.length) segments.push(current)
      current = []
    } else {
      current.push({ x: x(i), y: y(p.value) })
    }
  })
  if (current.length) segments.push(current)

  const last = values[values.length - 1]!
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit}`

  return (
    <div className="rounded-xl border border-white/10 bg-navy-800 p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40">{label}</h4>
        <span className={`font-display text-xl tabular-nums ${t.text}`}>{fmt(last)}</span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        height={SVG_HEIGHT}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} — min ${fmt(min)}, max ${fmt(max)}`}
      >
        {segments.map((seg, si) => {
          const line = seg.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ')
          const area = seg.length > 1
            ? `${line} L ${seg[seg.length - 1]!.x.toFixed(1)} ${SVG_HEIGHT - PAD_BOTTOM} L ${seg[0]!.x.toFixed(1)} ${SVG_HEIGHT - PAD_BOTTOM} Z`
            : null
          return (
            <g key={si}>
              {area && <path d={area} className={t.fill} stroke="none" />}
              <path d={line} className={t.stroke} fill="none" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              {seg.length === 1 && <circle cx={seg[0]!.x} cy={seg[0]!.y} r={2} className={t.stroke} />}
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/35">
        <span>min {fmt(min)}</span>
        <span>max {fmt(max)}</span>
      </div>
    </div>
  )
}
