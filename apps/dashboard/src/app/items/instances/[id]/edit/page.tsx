import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchAdminItemTypes, fetchItem } from '../../../../../lib/api'
import { DEMO_ITEM_TYPES } from '../../../../../lib/demo-data'
import { ItemForm } from '../../../ItemForm'
import { fetchAllLockerOptions } from '../../_lockers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modifier article · SportLocker' }

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    const item = await fetchItem(id)

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
            <h2 className="font-display text-3xl">{item.itemType.name}</h2>
            <p className="mt-1 text-sm text-white/55">
              RFID <span className="font-mono">{item.rfidTag}</span>
              {' · '}
              {item.totalLoans} emprunt{item.totalLoans > 1 ? 's' : ''}
              {item.currentLocker && (
                <> · actuellement dans {item.currentLocker.distributor.name} (casier #{item.currentLocker.position + 1})</>
              )}
            </p>
          </div>
          <Link href="/items?tab=instances" className="text-sm text-white/60 transition hover:text-white">
            ← Retour
          </Link>
        </header>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <ItemForm
            mode="edit"
            id={item.id}
            itemTypes={types.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
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
