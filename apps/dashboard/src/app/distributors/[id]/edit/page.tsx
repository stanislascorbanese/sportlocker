import Link from 'next/link'
import { notFound } from 'next/navigation'

import { fetchDistributor } from '../../../../lib/api'
import { StatusPill } from '../../../../components/StatusPill'
import { DistributorEditForm } from './DistributorEditForm'

export const dynamic = 'force-dynamic'

export default async function EditDistributorPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

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
            <StatusPill status={distributor.status} />
            <span>{distributor.idleLockers} / {distributor.lockerCount} libres</span>
          </div>
        </div>
        <Link
          href="/distributors"
          className="text-sm text-white/60 transition hover:text-white"
        >
          ← Retour
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <DistributorEditForm distributor={distributor} />
      </div>
    </div>
  )
}
