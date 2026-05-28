import Link from 'next/link'

import { CommuneForm } from '../CommuneForm'

export const metadata = { title: 'Nouvelle commune · SportLocker' }

export default function NewCommunePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl text-navy-900 dark:text-white">Nouvelle commune</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/55">
            Ajoute une commune cliente et son contrat.
          </p>
        </div>
        <Link
          href="/communes"
          className="text-sm text-gray-600 transition-colors duration-base hover:text-navy-900 dark:text-white/60 dark:hover:text-white"
        >
          ← Retour
        </Link>
      </header>

      <div className="rounded-card border bg-white p-6 shadow-card dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <CommuneForm mode="create" />
      </div>
    </div>
  )
}
