import Link from 'next/link'

import { ItemTypeForm } from '../../ItemTypeForm'

export const metadata = { title: 'Nouveau type d\'article · SportLocker' }

export default function NewItemTypePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-3xl">Nouveau type d'article</h2>
          <p className="mt-1 text-sm text-white/55">
            Ajoute une référence générique au catalogue (ex : ballon basket, raquette tennis).
          </p>
        </div>
        <Link href="/items?tab=types" className="text-sm text-white/60 transition hover:text-white">
          ← Retour
        </Link>
      </header>

      <div className="rounded-xl border border-white/10 bg-navy-800 p-6">
        <ItemTypeForm mode="create" />
      </div>
    </div>
  )
}
