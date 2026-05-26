import type { Metadata, Viewport } from 'next'

import './globals.css'
import { BottomNav } from '../components/BottomNav'
import { AuthProvider } from '../lib/auth-context'
import { QueryProvider } from '../lib/query-provider'
import { ServiceWorkerRegister } from './ServiceWorkerRegister'

export const metadata: Metadata = {
  title: 'SportLocker — Emprunter du matériel sport',
  description: 'Service citoyen de prêt de matériel sportif en libre-service. Trouvez un distributeur, scannez, empruntez gratuitement.',
  manifest: '/manifest.json',
  applicationName: 'SportLocker',
  // Path explicite vers /icon-v2.png pour buster le cache favicon de Safari :
  // Safari indexe les favicons par l'URL de la page, pas par celle de l'icône,
  // donc même un ?hash= différent sur /icon.png ne suffit pas. Changer le
  // basename (icon → icon-v2) force Safari à traiter ça comme un nouveau
  // favicon et re-fetch.
  icons: {
    icon: '/icon-v2.png',
    shortcut: '/icon-v2.png',
    apple: '/icon-v2.png',
  },
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
          <QueryProvider>
            {children}
            <BottomNav />
          </QueryProvider>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
