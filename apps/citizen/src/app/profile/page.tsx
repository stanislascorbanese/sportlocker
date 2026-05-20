'use client'

import { signOut } from 'firebase/auth'
import { ArrowLeft, LogOut } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useRequireAuth } from '../../lib/auth-context'
import { getFirebaseAuth } from '../../lib/firebase'

export default function ProfilePage() {
  const user = useRequireAuth()
  const router = useRouter()
  if (!user) return null

  async function onSignOut() {
    await signOut(getFirebaseAuth())
    router.replace('/login')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 pb-8 pt-[calc(var(--safe-top)+1rem)]">
      <header className="flex items-center gap-3">
        <Link href="/" aria-label="Retour" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-display text-xl font-semibold">Profil</h1>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-2">
        {user.displayName && (
          <p className="text-lg font-semibold">{user.displayName}</p>
        )}
        {user.email && <p className="text-sm text-white/70">{user.email}</p>}
        {user.phoneNumber && <p className="text-sm font-mono text-white/70">{user.phoneNumber}</p>}
        <p className="pt-2 font-mono text-[10px] text-white/40 break-all">UID : {user.uid}</p>
      </section>

      <button
        type="button"
        onClick={onSignOut}
        className="flex items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20"
      >
        <LogOut className="h-4 w-4" />
        Se déconnecter
      </button>
    </main>
  )
}
