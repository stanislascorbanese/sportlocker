import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApiError, fetchCommune } from '../../../../lib/api'
import { CommuneForm } from '../../CommuneForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Modifier commune · SportLocker' }

export default async function EditCommunePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  try {
    const commune = await fetchCommune(id)

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-3xl">{commune.name}</h2>
            <p className="mt-1 text-sm text-white/55">
              INSEE <span className="font-mono">{commune.inseeCode}</span>
              {' · '}
              {commune.distributorCount} distributeur{commune.distributorCount > 1 ? 's' : ''} rattaché{commune.distributorCount > 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/communes" className="text-sm text-white/60 transition hover:text-white">
            ← Retour
          </Link>
        </header>

        <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
          <CommuneForm
            mode="edit"
            id={commune.id}
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
