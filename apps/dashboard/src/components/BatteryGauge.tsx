import { cn } from '../lib/cn'

/**
 * Batterie : non encore tracée en DB (pas de colonne sur distributor_heartbeats).
 * Affiche "—" tant que le champ est `null`. À brancher quand le firmware
 * publie un `batteryPercent` dans le heartbeat MQTT.
 */
export function BatteryGauge({
  percent,
  unavailableTitle = 'Donnée non disponible (TODO firmware)',
}: {
  percent: number | null
  unavailableTitle?: string
}) {
  if (percent == null) {
    return <span className="text-zinc-500" title={unavailableTitle}>—</span>
  }
  const color =
    percent < 15 ? 'bg-rose-500' :
    percent < 35 ? 'bg-amber-400' :
    'bg-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-3 w-10 overflow-hidden rounded-sm border border-white/20">
        <div className={cn('h-full transition-all', color)} style={{ width: `${percent}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-white/80">{percent}%</span>
    </div>
  )
}
