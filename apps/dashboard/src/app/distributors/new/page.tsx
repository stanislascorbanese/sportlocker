import Link from 'next/link'

import { DistributorCreateForm } from './DistributorCreateForm'

export const metadata = { title: 'Nouveau distributeur · SportLocker' }

export default function NewDistributorPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">Nouveau distributeur</h2>
          <p className="mt-1 text-sm text-white/55">
            Création d&apos;un distributeur et de ses N casiers associés.
          </p>
        </div>
        <Link
          href="/distributors"
          className="text-sm text-white/60 transition hover:text-white"
        >
          ← Retour
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <DistributorCreateForm />
      </div>
    </div>
  )
}
