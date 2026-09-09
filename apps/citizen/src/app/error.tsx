'use client'

import { TopBar } from '@/components/Chrome'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="screen">
      <TopBar />
      <div className="flex flex-1 flex-col justify-center gap-6 text-center">
        <h1 className="font-display text-display-md font-bold">Ça n’a pas marché</h1>
        <p className="text-ink-muted">
          Réessayez. Si le casier ne s’ouvre toujours pas, passez à l’accueil du camping.
        </p>
        <button type="button" onClick={reset} className="btn-primary">
          Réessayer
        </button>
      </div>
    </main>
  )
}
