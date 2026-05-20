import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchAdminItemType } from '../../../../../lib/api'
import { ItemTypeForm } from '../../../ItemTypeForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modifier type · SportLocker' }

export default async function EditItemTypePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

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
              {type.activeItemCount} article{type.activeItemCount > 1 ? 's' : ''} physique{type.activeItemCount > 1 ? 's' : ''}
              {' · '}
              {type.totalReservations} emprunt{type.totalReservations > 1 ? 's' : ''} historiques
            </p>
          </div>
          <Link href="/items?tab=types" className="text-sm text-white/60 transition hover:text-white">
            ← Retour
          </Link>
        </header>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <ItemTypeForm
            mode="edit"
            id={type.id}
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
