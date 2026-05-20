'use client'

import { signOut } from 'firebase/auth'
import { Map, History, User, LogOut } from 'lucide-react'
import Link from 'next/link'

import { useRequireAuth } from '../lib/auth-context'
import { getFirebaseAuth } from '../lib/firebase'

export default function HomePage() {
  const user = useRequireAuth()

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-white/40 text-sm">Chargement…</p>
      </main>
    )
  }

  const displayName = user.displayName || user.email || user.phoneNumber || 'sportif'

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 pb-8 pt-[calc(var(--safe-top)+1.5rem)]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-emerald-300/70">Bienvenue</p>
          <h1 className="font-display text-2xl font-bold">{displayName.split(' ')[0]}</h1>
        </div>
        <button
          type="button"
          onClick={() => signOut(getFirebaseAuth())}
          className="rounded-lg border border-white/10 p-2 text-white/60 hover:border-white/30 hover:text-white"
          aria-label="Se déconnecter"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-5">
        <p className="text-xs uppercase tracking-wider text-emerald-300/70">Prêt à emprunter ?</p>
        <p className="mt-2 text-lg font-semibold leading-snug">
          Trouve un distributeur près de chez toi.
        </p>
        <Link
          href="/map"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-navy-900 transition hover:bg-emerald-400"
        >
          <Map className="h-4 w-4" />
          Voir la carte
        </Link>
      </section>

      <nav className="grid grid-cols-3 gap-3">
        <Link href="/map" className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30">
          <Map className="h-5 w-5" />
          <span className="text-xs">Carte</span>
        </Link>
        <Link href="/history" className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30">
          <History className="h-5 w-5" />
          <span className="text-xs">Historique</span>
        </Link>
        <Link href="/profile" className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-white/30">
          <User className="h-5 w-5" />
          <span className="text-xs">Profil</span>
        </Link>
      </nav>

      <footer className="mt-auto text-center text-[11px] text-white/30">
        SportLocker · service citoyen gratuit
      </footer>
    </main>
  )
}
