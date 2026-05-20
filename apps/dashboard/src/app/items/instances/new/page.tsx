import Link from 'next/link'

import { fetchAdminItemTypes } from '../../../../lib/api'
import { DEMO_ITEM_TYPES } from '../../../../lib/demo-data'
import { ItemForm } from '../../ItemForm'
import { fetchAllLockerOptions } from '../_lockers'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Nouvel article · SportLocker' }

export default async function NewItemPage() {
  // On laisse passer l'erreur de fetchItemTypes sans crash (mode démo).
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
          <h2 className="font-display text-3xl">Nouvel article physique</h2>
          <p className="mt-1 text-sm text-white/55">
            Enregistre une instance physique (RFID unique) liée à un type du catalogue.
          </p>
        </div>
        <Link href="/items?tab=instances" className="text-sm text-white/60 transition hover:text-white">
          ← Retour
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <ItemForm
          mode="create"
          itemTypes={types.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
          lockers={lockers}
        />
      </div>
    </div>
  )
}
