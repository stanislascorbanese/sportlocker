const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

type Point = { dow: number; hour: number; count: number }

/** Heatmap 7 lignes (jours) × 24 colonnes (heures). Intensité emerald
 *  proportionnelle au max. Tooltip natif via <title>. */
export function Heatmap({ points }: { points: Point[] }) {
  const max = Math.max(1, ...points.map((p) => p.count))
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const p of points) {
    if (grid[p.dow]) grid[p.dow]![p.hour] = p.count
  }

  // Lundi en haut = plus français. On réordonne : 1,2,3,4,5,6,0
  const order = [1, 2, 3, 4, 5, 6, 0]
  const total = points.reduce((a, p) => a + p.count, 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-white/40">
        <span>{total} réservations · jaune = pic</span>
        <span>0h → 23h →</span>
      </div>
      <div className="space-y-0.5">
        {order.map((dow) => (
          <div key={dow} className="flex items-center gap-1.5">
            <span className="w-7 text-[11px] text-white/45">{DAY_LABELS[dow]}</span>
            <div className="flex flex-1 gap-0.5">
              {Array.from({ length: 24 }, (_, hour) => {
                const v = grid[dow]?.[hour] ?? 0
                const intensity = v / max
                return (
                  <div
                    key={hour}
                    className="h-5 flex-1 rounded-sm"
                    style={{
                      backgroundColor: v === 0
                        ? 'rgba(255,255,255,0.04)'
                        : `rgba(52, 211, 153, ${0.15 + 0.85 * intensity})`,
                    }}
                  >
                    <span className="sr-only">{`${DAY_LABELS[dow]} ${hour}h: ${v}`}</span>
                    <div className="h-full w-full" title={`${DAY_LABELS[dow]} ${hour}h — ${v} réservation${v > 1 ? 's' : ''}`} />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between pl-9 text-[10px] text-white/30">
        <span>0h</span>
        <span>6h</span>
        <span>12h</span>
        <span>18h</span>
        <span>23h</span>
      </div>
    </div>
  )
}
