import { Users } from 'lucide-react'

import { fetchStays, type StayRow } from '../../lib/api'
import { RefreshButton } from '../../components/RefreshButton'
import { ErrorState, PageHeader } from '../../components/ui'
import { getLang } from '../../lib/lang-server'
import { commonStrings } from '../../lib/i18n/common'
import { makeMetadata } from '../../lib/i18n/metadata'
import { stayStrings } from '../../lib/i18n/stays'
import { StayImport } from './StayImport'
import { StaysTable } from './StaysTable'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => stayStrings(lang).title)

/**
 * Les séjours du camping.
 *
 * C'est la seule donnée que SportLocker demande au camping, et elle vient de
 * son PMS : le vacancier tape son numéro d'emplacement et son nom à la borne,
 * et il faut bien que quelque chose sache que ce couple existe.
 *
 * L'import passe avant la liste dans la page. Un camping ouvre cet écran pour
 * verser son fichier du samedi, pas pour consulter ses arrivées — il les a
 * déjà dans son logiciel.
 */
export default async function StaysPage() {
  const lang = await getLang()
  const t = stayStrings(lang)
  const c = commonStrings(lang)

  let rows: StayRow[] = []
  let fetchError: string | null = null

  try {
    rows = await fetchStays(200)
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'API unreachable'
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        icon={<Users size={20} aria-hidden />}
        actions={<RefreshButton />}
      />

      <StayImport lang={lang} />

      {fetchError ? <ErrorState title={c.apiErrorFallback} message={fetchError} /> : null}

      {!fetchError ? <StaysTable rows={rows} lang={lang} /> : null}
    </div>
  )
}
