import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchAdminItemType } from '../../../../../lib/api'
import { getLang } from '../../../../../lib/lang-server'
import { commonStrings } from '../../../../../lib/i18n/common'
import { itemsStrings } from '../../../../../lib/i18n/items'
import { makeMetadata } from '../../../../../lib/i18n/metadata'
import { ItemTypeForm } from '../../../ItemTypeForm'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => itemsStrings(lang).metaTitleEditType)

export default async function EditItemTypePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await getLang()
  const t = itemsStrings(lang)
  const c = commonStrings(lang)

  try {
    const type = await fetchAdminItemType(id)

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-3xl">{type.name}</h2>
            <p className="mt-1 text-sm text-white/55">
              <span className="font-mono">{type.slug}</span>
              {' · '}
              {type.activeItemCount} {type.activeItemCount > 1 ? t.physicalMany : t.physical1}
              {' · '}
              {type.totalReservations} {lang === 'fr' ? 'historiques' : 'historical loans'}
            </p>
          </div>
          <Link href="/items?tab=types" className="text-sm text-white/60 transition hover:text-white">
            ← {c.back}
          </Link>
        </header>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <ItemTypeForm
            mode="edit"
            id={type.id}
            lang={lang}
            initial={{
              slug:               type.slug,
              name:               type.name,
              category:           type.category,
              description:        type.description,
              imageUrl:           type.imageUrl,
              cautionCents:       type.cautionCents,
              maxDurationMinutes: type.maxDurationMinutes,
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
