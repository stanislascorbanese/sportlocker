import { ItemGlyph } from './ItemGlyph'
import type { ItemKind } from '@/lib/contract'

/**
 * L'écran qui compte.
 *
 * Après l'ouverture, le vacancier lève les yeux vers une borne de huit portes
 * identiques. Le numéro doit être lisible à un mètre, de biais, au soleil —
 * donc énorme, sur aplat de marque, et seul sur son écran. Tout le reste est
 * secondaire et passe en dessous.
 */
export function LockerReveal({
  lockerNumber,
  title,
  itemLabel,
  kind,
}: {
  lockerNumber: number
  title: string
  itemLabel?: string | undefined
  kind?: ItemKind | undefined
}) {
  return (
    <div className="animate-scale-in rounded-sheet bg-brand px-6 py-10 text-center text-brand-on">
      <p className="text-[1.0625rem] font-semibold opacity-90">{title}</p>
      <p className="mt-2 text-eyebrow font-bold uppercase tracking-[0.16em] opacity-75">Casier</p>
      <p className="font-display text-locker font-bold tabular-nums">{lockerNumber}</p>
      {itemLabel && kind ? (
        <p className="mt-2 inline-flex items-center gap-2 text-[1.0625rem] font-semibold opacity-90">
          <ItemGlyph kind={kind} className="h-6 w-6" />
          {itemLabel}
        </p>
      ) : null}
    </div>
  )
}
