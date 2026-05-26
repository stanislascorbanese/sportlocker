'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

import { useRequireAuth } from '../../lib/auth-context'

export default function HistoryPage() {
  const user = useRequireAuth()
  if (!user) return null

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-[calc(var(--safe-bottom)+5rem)] pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-xl font-semibold">Historique</h1>
      </header>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm text-white/60">Tu n'as pas encore d'emprunts passés.</p>
        <p className="mt-1 text-[11px] text-white/40">Ils apparaîtront ici après ta première réservation.</p>
      </section>
    </main>
  )
}
