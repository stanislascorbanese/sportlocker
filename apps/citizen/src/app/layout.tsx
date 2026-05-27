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
  // maximumScale=5 + userScalable=true → respecte WCAG 1.4.4 "Resize Text"
  // qui exige que les users puissent zoomer jusqu'à 200 %. Avant ce
  // changement, Lighthouse a11y notait 88 et flaggait `meta-viewport`.
  // Trade-off iOS : les inputs < 16px peuvent maintenant déclencher
  // l'auto-zoom sur focus → tous les inputs critiques (login email) sont
  // passés à `text-base` (16px) pour éviter le re-zoom involontaire.
  maximumScale: 5,
  userScalable: true,
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
    // Préchargement opportuniste du logo splash dans la bonne variante.
    // Le CSS le déclencherait de toute façon, mais préfetcher dès le <head>
    // raccourcit la fenêtre où le splash s'affiche sans son logo.
    var link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = theme === 'dark' ? '/splash-logo-dark.png' : '/splash-logo-light.png';
    document.head.appendChild(link);
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
            {/* Logo officiel SportLocker — la bonne version (sombre/blanche) est
             * sélectionnée via CSS selon la classe `dark` sur <html>. Le browser
             * ne télécharge que l'image qui matche, grâce au comportement des
             * background-image en CSS. */}
            <div className="sl-splash-mark" role="img" aria-label="SportLocker" />
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
