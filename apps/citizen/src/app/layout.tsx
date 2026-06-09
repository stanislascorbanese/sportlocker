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
  // Cache-bust favicon en changeant le BASENAME (v2 → v3), pas un ?hash= :
  // Safari indexe les favicons par l'URL de la page, pas par celle de l'icône,
  // donc un ?hash= différent sur /icon.png ne suffit pas à forcer le re-fetch.
  // v3 (09/06) : v2 n'affichait que la porte verte (le "S" et le ballon étaient
  // un tracé blanc fantôme, invisible sur tuile blanche d'écran d'accueil iOS).
  //  - icon/shortcut (onglet)  → /icon-v3.png : marque SL complète, fond
  //    transparent, lisible en petit et qui s'adapte au thème clair/sombre.
  //  - apple (écran d'accueil) → /apple-icon-v3.png : tuile vert foncé pleine
  //    (logo-icon-filled, bords pleins → safe sous le masque maskable Android).
  icons: {
    icon: '/icon-v3.png',
    shortcut: '/icon-v3.png',
    apple: '/apple-icon-v3.png',
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

/**
 * Origines critiques qu'on contacte au premier paint :
 *   - api.sportlocker.fr  → toutes les data calls (React Query + form posts)
 *   - tiles.openfreemap.org → tuiles MapLibre (style + raster/vector tiles)
 *   - googleapis.com + firebaseapp.com → Firebase Auth (REST + popup)
 *
 * `preconnect` ouvre le TCP+TLS handshake en avance (gros gain mobile 4G/3G).
 * `dns-prefetch` est le fallback pour les browsers qui ignorent preconnect.
 *
 * `crossOrigin="anonymous"` requis pour les origines qu'on appelle en CORS
 * (fetch/XHR sans credentials) — sinon le preconnect est ignoré silencieusement.
 *
 * NEXT_PUBLIC_API_BASE peut pointer vers localhost en dev → la directive
 * preconnect deviendra un no-op silencieux côté browser. Pas grave.
 */
const API_ORIGIN = (() => {
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE
    if (!base) return null
    return new URL(base).origin
  } catch {
    return null
  }
})()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {API_ORIGIN && (
          <>
            <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={API_ORIGIN} />
          </>
        )}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
        <link rel="preconnect" href="https://www.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://www.googleapis.com" />
        <link rel="dns-prefetch" href="https://identitytoolkit.googleapis.com" />
        {/* Preload de l'image du splash (élément LCP) → découverte immédiate
            par le navigateur, sinon elle n'est trouvée qu'après parsing du CSS
            (cf. audit Lighthouse « Détection de la requête LCP »). On preload la
            variante claire (thème par défaut + ce que teste PageSpeed). */}
        <link rel="preload" as="image" href="/splash-logo-light.png" fetchPriority="high" />
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
