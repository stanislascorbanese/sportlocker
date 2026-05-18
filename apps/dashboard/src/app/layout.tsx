import type { Metadata } from 'next'

import { Shell } from '../components/Shell'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-navy-900 font-sans text-white antialiased">
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
