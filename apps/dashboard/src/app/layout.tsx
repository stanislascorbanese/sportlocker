import type { Metadata } from 'next'

import { Sidebar } from '../components/Sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-navy-900 font-sans text-white antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  )
}
