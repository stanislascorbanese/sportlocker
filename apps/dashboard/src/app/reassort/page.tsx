import { PackageOpen } from 'lucide-react'

import { fetchDistributor, fetchDistributors } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { EmptyState, ErrorState, PageHeader } from '../../components/ui'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { makeMetadata } from '../../lib/i18n/metadata'
import { reassortStrings } from '../../lib/i18n/reassort'
import { KioskBoard } from './KioskBoard'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => reassortStrings(lang).title)

/**
 * Écran de réassort.
 *
 * C'est l'écran du matin, celui que le saisonnier de l'accueil ouvre sur une
 * tablette avant d'aller faire le tour. Il ne pose qu'une question : quels
 * casiers sont vides, et qu'est-ce qu'on y remet.
 *
 * Choix de conception : tout est visible d'un coup, sans filtre ni onglet. Un
 * exploitant a une à quatre bornes de huit casiers — ça tient dans un écran, et
 * cliquer pour découvrir l'information ferait perdre plus de temps que d'en
 * afficher un peu trop.
 */
export default async function ReassortPage() {
  const lang = await getLang()
  const t = reassortStrings(lang)
  const c = commonStrings(lang)

  let boards: Awaited<ReturnType<typeof fetchDistributor>>[] = []
  let fetchError: string | null = null

  try {
    const list = await fetchDistributors()
    boards = await Promise.all(list.map((d) => fetchDistributor(d.id)))
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  const toRefill = boards.reduce(
    (total, board) =>
      total + board.lockers.filter((l) => l.state === 'idle' && !l.currentItemId).length,
    0,
  )

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        icon={<PackageOpen size={20} aria-hidden />}
        actions={<RefreshButton />}
      />

      {fetchError ? <ErrorState title={c.apiErrorFallback} message={fetchError} /> : null}

      {!fetchError && boards.length > 0 && toRefill === 0 ? (
        <EmptyState title={t.nothingToDo} description={t.nothingToDoHint} />
      ) : null}

      {boards.map((board) => (
        <KioskBoard key={board.id} board={board} lang={lang} />
      ))}
    </div>
  )
}
