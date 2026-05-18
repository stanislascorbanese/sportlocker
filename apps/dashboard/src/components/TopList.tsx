import { cn } from '../lib/cn'

type Item = {
  primary: string
  secondary?: string
  count: number
  href?: string
}

/** Barres horizontales triées. Largeur relative au max. */
export function TopList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return <div className="text-xs text-white/40">aucune donnée</div>
  }
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const pct = (it.count / max) * 100
        return (
          <li key={`${it.primary}-${i}`} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1 truncate">
                <span className="text-sm text-white">{it.primary}</span>
                {it.secondary && (
                  <span className="ml-2 font-mono text-[11px] text-white/40">{it.secondary}</span>
                )}
              </div>
              <span className="shrink-0 tabular-nums text-sm text-white/80">{it.count}</span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  i === 0 ? 'bg-emerald-400/80' : i === 1 ? 'bg-emerald-400/60' : 'bg-emerald-400/40',
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
