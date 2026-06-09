import Link from 'next/link'

import { fetchCommunes, type Commune } from '../../../lib/api'
import { getLang } from '../../../lib/lang-server'
import { distributorsStrings } from '../../../lib/i18n/distributors'
import { makeMetadata } from '../../../lib/i18n/metadata'
import { DistributorCreateForm } from './DistributorCreateForm'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).newMetaTitle)

export default async function NewDistributorPage() {
  const lang = await getLang()
  const t = distributorsStrings(lang)

  let communes: Commune[] = []
  try {
    communes = await fetchCommunes()
  } catch {
    // Si l'API admin refuse, on laisse le form afficher un fallback input UUID.
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">{t.newTitle}</h2>
          <p className="mt-1 text-sm text-white/55">{t.newSubtitle}</p>
        </div>
        <Link
          href="/distributors"
          className="text-sm text-white/60 transition hover:text-white"
        >
          {t.back}
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <DistributorCreateForm communes={communes} lang={lang} />
      </div>
    </div>
  )
}
