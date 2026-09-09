import type { Metadata, Viewport } from 'next'
import { ThemeProvider, themeBootScript } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'Emprunter du matériel — SportLocker',
  description:
    "Empruntez un ballon ou une raquette à la borne de votre camping, avec votre numéro de séjour.",
  manifest: '/manifest.json',
  // Cette page n'a rien à faire dans un moteur de recherche : on n'y arrive
  // qu'en scannant le QR code collé sur une borne.
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'SportLocker', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste autorisé : c'est une aide d'accessibilité, et le parcours
  // est déjà dimensionné pour ne pas en avoir besoin.
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Chargées en lien plutôt qu'en next/font : le build doit rester
            possible hors ligne, et la pile système prend le relais sans que
            la mise en page bouge. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Syne:wght@700;800&display=swap"
        />
      </head>
      <body className="bg-bg text-ink antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
