import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchAdminItemTypes, fetchItem } from '../../../../../lib/api'
import { getLang } from '../../../../../lib/lang-server'
import { commonStrings } from '../../../../../lib/i18n/common'
import { itemsStrings } from '../../../../../lib/i18n/items'
import { makeMetadata } from '../../../../../lib/i18n/metadata'
import { ItemForm } from '../../../ItemForm'
import { fetchAllLockerOptions } from '../../_lockers'

export const dynamic = 'force-dynamic'
export const generateMetadata = makeMetadata((lang) => itemsStrings(lang).metaTitleEditInstance)

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lang = await getLang()
  const t = itemsStrings(lang)
  const c = commonStrings(lang)

  try {
    const item = await fetchItem(id)

    let types: Awaited<ReturnType<typeof fetchAdminItemTypes>>
    let lockers: Awaited<ReturnType<typeof fetchAllLockerOptions>>
    try {
      types = await fetchAdminItemTypes()
    } catch {
      // Lazy-load demo-data uniquement en fallback (code-splitting serveur).
      types = (await import('../../../../../lib/demo-data')).DEMO_ITEM_TYPES
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
            <h2 className="font-display text-3xl">{item.itemType.name}</h2>
            <p className="mt-1 text-sm text-white/55">
              RFID <span className="font-mono">{item.rfidTag}</span>
              {' · '}
              {item.totalLoans} {lang === 'fr' ? `emprunt${item.totalLoans > 1 ? 's' : ''}` : `loan${item.totalLoans > 1 ? 's' : ''}`}
              {item.currentLocker && (
                <> · {lang === 'fr' ? 'actuellement dans' : 'currently in'} {item.currentLocker.distributor.name} ({t.lockerHash}{item.currentLocker.position + 1})</>
              )}
            </p>
          </div>
          <Link href="/items?tab=instances" className="text-sm text-white/60 transition hover:text-white">
            ← {c.back}
          </Link>
        </header>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <ItemForm
            mode="edit"
            id={item.id}
            lang={lang}
            itemTypes={types.map((tp) => ({ id: tp.id, name: tp.name, category: tp.category }))}
            lockers={lockers}
            initial={{
              itemTypeId:      item.itemType.id,
              rfidTag:         item.rfidTag,
              condition:       item.condition,
              currentLockerId: item.currentLocker?.id ?? null,
              lastInspectedAt: item.lastInspectedAt,
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
