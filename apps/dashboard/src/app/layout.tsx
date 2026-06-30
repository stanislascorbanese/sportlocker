import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { Shell } from '../components/Shell'
import { LangProvider } from '../lib/lang-client'
import { getLang } from '../lib/lang-server'
import { getSessionUser } from '../lib/session-server'
import { ThemeProvider } from '../lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: 'SportLocker — Dashboard opérateur',
  description: 'Pilotage des distributeurs IoT SportLocker',
}

/**
 * Script anti-FOUC : pose la classe `dark` sur <html> AVANT le premier
 * paint quand l'utilisateur a stocké `dark` ou n'a aucune préférence
 * (dashboard est dark par défaut — pas de detection prefers-color-scheme
 * pour ne pas surprendre les admins habitués au look navy).
 *
 * IMPORTANT : la logique doit rester en sync avec `resolveTheme()` dans
 * `lib/theme.tsx`. Si tu changes l'une, change l'autre.
 */
const themeBootstrapScript = `
(function() {
  try {
    var stored = localStorage.getItem('sl-dashboard-theme');
    if (stored === 'light') {
      // light explicite → on ne pose pas .dark
    } else {
      // dark (défaut), 'dark' explicite, ou 'system' → on pose .dark sauf si
      // system + prefers-light. Le dashboard étant historiquement navy, on
      // privilégie dark par sécurité.
      var prefersLight = stored === 'system'
        && window.matchMedia('(prefers-color-scheme: light)').matches;
      if (!prefersLight) document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [user, lang] = await Promise.all([getSessionUser(), getLang()])
  return (
    <html lang={lang}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="min-h-screen bg-white font-sans text-navy-900 antialiased dark:bg-navy-900 dark:text-white">
        <ThemeProvider>
          <LangProvider initial={lang}>
            <Shell user={user}>{children}</Shell>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
