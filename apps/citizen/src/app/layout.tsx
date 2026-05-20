import type { Metadata, Viewport } from 'next'

import './globals.css'
import { AuthProvider } from '../lib/auth-context'
import { QueryProvider } from '../lib/query-provider'
import { ServiceWorkerRegister } from './ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'SportLocker — Emprunter du matériel sport',
  description: 'Service citoyen de prêt de matériel sportif en libre-service. Trouvez un distributeur, scannez, empruntez gratuitement.',
  manifest: '/manifest.json',
  applicationName: 'SportLocker',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SportLocker',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0D1B2A',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-navy-900 font-sans antialiased">
        <AuthProvider>
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
