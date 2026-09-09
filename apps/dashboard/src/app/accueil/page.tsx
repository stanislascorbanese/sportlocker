import { fetchDistributor, fetchDistributors, fetchReservations } from '../../lib/api'
import { getLang } from '../../lib/lang-server'
import { makeMetadata } from '../../lib/i18n/metadata'
import { kioskStrings } from '../../lib/i18n/kiosk'
import { KioskScreen, type RefillRow, type UnreturnedRow } from './KioskScreen'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => kioskStrings(lang).title)

/**
 * Mode accueil.
 *
 * L'écran qu'on laisse ouvert toute la saison sur la tablette de la réception,
 * ou qu'un saisonnier ouvre sur son propre téléphone en faisant le tour.
 *
 * Deux listes, rien d'autre : ce qu'il faut remettre dans les casiers, et ce
 * qui n'est pas rentré. Pas de navigation, pas de réglages, pas de graphique —
 * la personne qui l'utilise a été formée dix minutes et change chaque saison.
 *
 * Ce n'est pas une frontière de sécurité : la session reste celle du compte
 * connecté. Pour que l'équipe n'ait pas le mot de passe du gérant, la bonne
 * réponse est un compte au rôle « opérateur », et l'écran le rappelle.
 */
export default async function KioskPage() {
  const lang = await getLang()

  let refill: RefillRow[] = []
  let unreturned: UnreturnedRow[] = []
  let hadError = false

  try {
    const list = await fetchDistributors()
    const boards = await Promise.all(list.map((d) => fetchDistributor(d.id)))

    refill = boards.flatMap((board) =>
      board.lockers
        .filter((locker) => locker.state === 'idle' && !locker.currentItemId)
        .sort((a, b) => a.position - b.position)
        .map((locker) => ({
          key: locker.id,
          kioskName: board.name,
          serial: board.serialNumber,
          offline: board.status !== 'online',
          position: locker.position,
          // Le libellé du type d'article reste attaché au casier tant qu'il
          // n'a pas été réaffecté : c'est ce qui dit au saisonnier quoi y
          // remettre plutôt que « un truc ».
          expected: locker.itemType?.name ?? null,
        })),
    )

    const [overdue, active] = await Promise.all([
      fetchReservations({ status: 'overdue', limit: 100 }),
      fetchReservations({ status: 'active', limit: 100 }),
    ])
    const longOut = active.items.filter((r) => hoursSince(r.openedAt) >= 4)

    unreturned = [...overdue.items, ...longOut]
      .sort((a, b) => hoursSince(b.openedAt) - hoursSince(a.openedAt))
      .map((r) => ({
        key: r.id,
        guest: r.user.displayName?.trim() || r.user.email,
        item: r.item.typeName,
        serial: r.distributor.serialNumber,
        hours: Math.max(0, Math.floor(hoursSince(r.openedAt))),
        overdue: r.status === 'overdue',
      }))
  } catch {
    hadError = true
  }

  return (
    <KioskScreen
      lang={lang}
      refill={refill}
      unreturned={unreturned}
      hadError={hadError}
      generatedAt={new Date().toISOString()}
    />
  )
}

/** Heures écoulées depuis l'ouverture du casier. 0 si la date manque. */
function hoursSince(iso: string | null): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}
