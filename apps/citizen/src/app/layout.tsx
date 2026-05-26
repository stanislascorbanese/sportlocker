import type { Metadata, Viewport } from 'next'

import './globals.css'
import { AuthProvider } from '../lib/auth-context'
import { I18nProvider } from '../lib/i18n/I18nProvider'
import { QueryProvider } from '../lib/query-provider'
import { ThemeProvider } from '../lib/theme'
import { ServiceWorkerRegister } from './ServiceWorkerRegister'
import { SplashHide } from './SplashHide'

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
  // theme-color initial = sombre (dark est le défaut quand aucune préférence
  // stockée). ThemeProvider met à jour le meta dynamiquement au toggle.
  themeColor: '#0D1B2A',
  viewportFit: 'cover',
}

/**
 * Script anti-FOUC. Lit la préférence theme stockée + système et pose la
 * classe `dark` sur <html> AVANT le premier paint. Sans ça, l'utilisateur
 * voit un flash blanc en mode dark (ou inversement) pendant l'hydratation
 * React.
 *
 * IMPORTANT : la logique doit rester en sync avec `resolveTheme()` dans
 * `lib/theme.tsx`. Si tu changes l'une, change l'autre.
 */
const themeBootstrapScript = `
(function() {
  try {
    var stored = localStorage.getItem('sl-theme');
    var theme;
    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`

/**
 * Fallback : si l'hydratation React n'a jamais lieu (erreur JS, JS bloqué,
 * réseau lent au-delà du raisonnable), retire le splash après 4s pour ne pas
 * laisser l'utilisateur bloqué sur le logo. Le chemin nominal passe par
 * <SplashHide /> qui pose l'attribut dès le premier paint React (≈ 50-300ms).
 */
const splashFallbackScript = `
(function() {
  try {
    setTimeout(function() {
      document.documentElement.setAttribute('data-splash-done', 'true');
    }, 4000);
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: splashFallbackScript }} />
      </head>
      <body className="min-h-screen bg-white font-sans antialiased dark:bg-navy-900">
        <div id="sl-splash" aria-hidden="true">
          <div className="sl-splash-inner">
            <svg
              className="sl-splash-mark"
              width="64"
              height="64"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="sl-splash-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#15785A" />
                  <stop offset="100%" stopColor="#34D399" />
                </linearGradient>
              </defs>
              <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#sl-splash-grad)" />
              <path
                d="M22 28v-4a10 10 0 0 1 20 0v4"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              <rect x="18" y="28" width="28" height="20" rx="4" fill="#ffffff" />
              <circle cx="32" cy="38" r="2.4" fill="#15785A" />
            </svg>
            <div className="sl-splash-word">SportLocker</div>
            <div className="sl-splash-bar" role="presentation">
              <span />
            </div>
          </div>
        </div>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <SplashHide />
              <QueryProvider>{children}</QueryProvider>
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
