import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Shell } from '../components/Shell'
import { getLang } from '../lib/lang-server'
import { getSessionUser } from '../lib/session-server'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, lang] = await Promise.all([getSessionUser(), getLang()])
  return (
    <html lang={lang}>
      <body className="min-h-screen bg-navy-900 font-sans text-white antialiased">
        <Shell user={user} lang={lang}>{children}</Shell>
      </body>
    </html>
  )
}
