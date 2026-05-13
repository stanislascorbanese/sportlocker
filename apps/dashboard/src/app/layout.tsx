import type { Metadata } from 'next'
import Link from 'next/link'

import { NavLinks } from '../components/NavLinks'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-navy-900 font-sans text-white antialiased">
        <header className="border-b border-white/10 bg-navy-900/80 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="font-display text-xl tracking-tight">
              SportLocker · <span className="text-emerald-400">ops</span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
