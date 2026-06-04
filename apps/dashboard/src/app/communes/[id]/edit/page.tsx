import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchCommune } from '../../../../lib/api'
import { getLang } from '../../../../lib/lang-server'
import { commonStrings } from '../../../../lib/i18n/common'
import { communesStrings } from '../../../../lib/i18n/communes'
import { CommuneForm } from '../../CommuneForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modifier commune · SportLocker' }

export default async function EditCommunePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await getLang()
  const t = communesStrings(lang)
  const c = commonStrings(lang)

  try {
    const commune = await fetchCommune(id)

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-3xl text-navy-900 dark:text-white">{commune.name}</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
              INSEE <span className="font-mono">{commune.inseeCode}</span>
              {' · '}
              {commune.distributorCount} {t.distrubutorsAbbrev}
            </p>
          </div>
          <Link
            href="/communes"
            className="text-sm text-gray-600 transition-colors duration-base hover:text-navy-900 dark:text-white/60 dark:hover:text-white"
          >
            ← {c.back}
          </Link>
        </header>

        <div className="rounded-card border bg-white p-6 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
          <CommuneForm
            mode="edit"
            id={commune.id}
            lang={lang}
            initial={{
              inseeCode:       commune.inseeCode,
              name:            commune.name,
              postalCode:      commune.postalCode,
              department:      commune.department,
              region:          commune.region,
              population:      commune.population,
              contractStart:   commune.contractStart,
              contractEnd:     commune.contractEnd,
              monthlyFeeCents: commune.monthlyFeeCents,
              contactEmail:    commune.contactEmail,
              contactPhone:    commune.contactPhone,
            }}
          />
        </div>
      </div>
    )
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return notFound()
    throw err
  }
}
