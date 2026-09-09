import { AlertTriangle } from 'lucide-react'

import { fetchReservations } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { EmptyState, ErrorState, PageHeader } from '../../components/ui'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { makeMetadata } from '../../lib/i18n/metadata'
import { unreturnedStrings } from '../../lib/i18n/unreturned'
import { UnreturnedTable } from './UnreturnedTable'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => unreturnedStrings(lang).title)

/**
 * Ce qui n'est pas revenu.
 *
 * Le camping facture sur le compte séjour, exactement comme pour un vélo : cet
 * écran ne fait donc rien d'automatique, il donne les trois informations qu'il
 * faut pour le faire à la main — qui, quoi, depuis quand.
 *
 * On regroupe deux cas que l'API distingue : les emprunts marqués `overdue`, et
 * ceux encore `active` mais sortis depuis un moment. Le second cas est celui
 * qui remonte le plus souvent en vrai — un vacancier qui garde le ballon
 * l'après-midi entier n'est pas encore « en retard » au sens du système.
 */
export default async function UnreturnedPage() {
  const lang = await getLang()
  const t = unreturnedStrings(lang)
  const c = commonStrings(lang)

  let rows: Awaited<ReturnType<typeof fetchReservations>>['items'] = []
  let fetchError: string | null = null

  try {
    const [overdue, active] = await Promise.all([
      fetchReservations({ status: 'overdue', limit: 100 }),
      fetchReservations({ status: 'active', limit: 100 }),
    ])
    const longOut = active.items.filter((r) => hoursSince(r.openedAt) >= 4)
    rows = [...overdue.items, ...longOut].sort(
      (a, b) => hoursSince(b.openedAt) - hoursSince(a.openedAt),
    )
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        icon={<AlertTriangle size={20} aria-hidden />}
        actions={<RefreshButton />}
      />

      {fetchError ? <ErrorState title={c.apiErrorFallback} message={fetchError} /> : null}

      {!fetchError && rows.length === 0 ? (
        <EmptyState title={t.noneTitle} description={t.noneHint} />
      ) : null}

      {rows.length > 0 ? <UnreturnedTable rows={rows} lang={lang} /> : null}
    </div>
  )
}

/** Heures écoulées depuis l'ouverture du casier. 0 si la date manque. */
function hoursSince(iso: string | null): number {
  if (!iso) return 0
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}
