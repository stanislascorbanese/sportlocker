import Link from 'next/link'

import { CommuneForm } from '../CommuneForm'

export const metadata = { title: 'Nouvelle commune · SportLocker' }

export default function NewCommunePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">Nouvelle commune</h2>
          <p className="mt-1 text-sm text-white/55">
            Ajoute une commune cliente et son contrat.
          </p>
        </div>
        <Link href="/communes" className="text-sm text-white/60 transition hover:text-white">
          ← Retour
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <CommuneForm mode="create" />
      </div>
    </div>
  )
}
