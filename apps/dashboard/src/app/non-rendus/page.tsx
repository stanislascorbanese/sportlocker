import { AlertTriangle } from 'lucide-react'

import { fetchLoans, type LoanRow } from '../../lib/api'
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
 * L'établissement facture sur le compte séjour, exactement comme pour un vélo : cet
 * écran ne fait donc rien d'automatique, il donne les trois informations qu'il
 * faut pour le faire à la main — quel emplacement, qui, depuis quand.
 *
 * Le seuil est à quatre heures. En dessous, un vacancier qui garde le ballon
 * l'après-midi n'a rien fait d'anormal et n'a pas à apparaître ici : une liste
 * qui remonte des faux positifs tous les matins finit par ne plus être ouverte.
 */
const SEUIL_HEURES = 4

export default async function UnreturnedPage() {
  const lang = await getLang()
  const t = unreturnedStrings(lang)
  const c = commonStrings(lang)

  let rows: LoanRow[] = []
  let fetchError: string | null = null

  try {
    rows = await fetchLoans({ status: 'open', minHoursOut: SEUIL_HEURES, limit: 200 })
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

      {!fetchError && rows.length > 0 ? <UnreturnedTable rows={rows} lang={lang} /> : null}
    </div>
  )
}
