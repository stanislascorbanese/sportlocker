import Link from 'next/link'
import { notFound } from 'next/navigation'

import { fetchDistributor } from '../../../../lib/api'
import { getLang } from '../../../../lib/lang-server'
import { distributorStatusLabel } from '../../../../lib/i18n/common'
import { distributorsStrings } from '../../../../lib/i18n/distributors'
import { makeMetadata } from '../../../../lib/i18n/metadata'
import { StatusPill } from '../../../../components/StatusPill'
import { DistributorEditForm } from './DistributorEditForm'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => distributorsStrings(lang).editMetaTitle)

export default async function EditDistributorPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const lang = await getLang()
  const t = distributorsStrings(lang)

  let distributor
  try {
    distributor = await fetchDistributor(id)
  } catch (err) {
    if (err instanceof Error && err.message === 'distributor_not_found') notFound()
    throw err
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="font-display text-3xl">{distributor.name}</h2>
          <div className="flex items-center gap-3 text-sm text-white/55">
            <span className="font-mono text-xs">{distributor.serialNumber}</span>
            <StatusPill status={distributor.status} label={distributorStatusLabel(lang, distributor.status)} />
            <span>{distributor.idleLockers} / {distributor.lockerCount} {t.lockersFreeOf}</span>
          </div>
        </div>
        <Link
          href="/distributors"
          className="text-sm text-white/60 transition hover:text-white"
        >
          {t.back}
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <DistributorEditForm distributor={distributor} lang={lang} />
      </div>
    </div>
  )
}
