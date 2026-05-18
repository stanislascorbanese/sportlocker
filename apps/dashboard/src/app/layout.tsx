import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Shell } from '../components/Shell'
import { getSessionUser } from '../lib/session-server'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  return (
    <html lang="fr">
      <body className="min-h-screen bg-navy-900 font-sans text-white antialiased">
        <Shell user={user}>{children}</Shell>
      </body>
    </html>
  )
}
