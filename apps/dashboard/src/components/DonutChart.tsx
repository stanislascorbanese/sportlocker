import { cn } from '../lib/cn'

export type DonutSlice = {
  label: string
  value: number
  color: string
}

/** Donut SVG inline. Pas de dépendance. */
export function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string | number
}) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  // On dessine chaque slice avec un stroke-dasharray + stroke-dashoffset
  let offset = 0

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} role="img" aria-label="Donut chart">
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0 && slices.map((s) => {
          const fraction = s.value / total
          const dash = circumference * fraction
          const gap = circumference - dash
          const seg = (
            <circle
              key={s.label}
              cx={cx} cy={cy} r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            >
              <title>{`${s.label}: ${s.value} (${Math.round(fraction * 100)}%)`}</title>
            </circle>
          )
          offset += dash
          return seg
        })}
        {centerValue !== undefined && (
          <text
            x={cx} y={cy}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white font-display"
            fontSize={size * 0.18}
          >
            {centerValue}
          </text>
        )}
        {centerLabel && (
          <text
            x={cx} y={cy + size * 0.16}
            textAnchor="middle"
            className="fill-white/40"
            fontSize={size * 0.07}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      {slices.length > 0 && (
        <ul className="flex-1 space-y-1.5 text-xs">
          {slices.map((s) => {
            const pct = total > 0 ? Math.round((s.value / total) * 100) : 0
            return (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate">
                  <span className={cn('h-2 w-2 rounded-full')} style={{ backgroundColor: s.color }} />
                  <span className="truncate text-white/70">{s.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-white/55">
                  <span className="text-white/85">{s.value}</span>
                  <span className="ml-1 text-white/35">{pct}%</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
