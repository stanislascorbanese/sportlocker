import Link from 'next/link'

import { fetchAdminItemTypes } from '../../../../lib/api'
import { DEMO_ITEM_TYPES } from '../../../../lib/demo-data'
import { getLang } from '../../../../lib/lang-server'
import { commonStrings } from '../../../../lib/i18n/common'
import { itemsStrings } from '../../../../lib/i18n/items'
import { makeMetadata } from '../../../../lib/i18n/metadata'
import { ItemForm } from '../../ItemForm'
import { fetchAllLockerOptions } from '../_lockers'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => itemsStrings(lang).metaTitleNewInstance)

export default async function NewItemPage() {
  const lang = await getLang()
  const t = itemsStrings(lang)
  const c = commonStrings(lang)

  let types: Awaited<ReturnType<typeof fetchAdminItemTypes>>
  let lockers: Awaited<ReturnType<typeof fetchAllLockerOptions>>
  try {
    types = await fetchAdminItemTypes()
  } catch {
    types = DEMO_ITEM_TYPES
  }
  try {
    lockers = await fetchAllLockerOptions()
  } catch {
    lockers = []
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">{t.btnNewInstance.replace('+ ', '')}</h2>
          <p className="mt-1 text-sm text-white/55">{t.subtitleNewInstance}</p>
        </div>
        <Link href="/items?tab=instances" className="text-sm text-white/60 transition hover:text-white">
          ← {c.back}
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <ItemForm
          mode="create"
          lang={lang}
          itemTypes={types.map((tp) => ({ id: tp.id, name: tp.name, category: tp.category }))}
          lockers={lockers}
        />
      </div>
    </div>
  )
}
