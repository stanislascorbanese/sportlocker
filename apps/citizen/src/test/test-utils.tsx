/**
 * Helpers de test partagés.
 *
 * `renderWithProviders` : wrappe le rendu RTL avec I18nProvider (et
 * ThemeProvider si besoin) — la majorité des composants citizen
 * utilisent `useT()` directement, donc sans wrapper le test crash avec
 * "useI18n must be used inside <I18nProvider>".
 *
 * Pour les tests qui veulent contrôler la locale, passer
 * `initialLocale: 'en'` dans les options.
 */
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { type ReactElement, type ReactNode, useEffect } from 'react'

import { I18nProvider, useI18n } from '../lib/i18n/I18nProvider'
import type { Locale } from '../lib/i18n/messages'

function LocaleSetter({ locale }: { locale: Locale }) {
  const { setLocale } = useI18n()
  useEffect(() => {
    setLocale(locale)
  }, [locale, setLocale])
  return null
}

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  initialLocale?: Locale
}

export function renderWithProviders(
  ui: ReactElement,
  { initialLocale, ...rtlOptions }: RenderWithProvidersOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nProvider>
        {initialLocale && <LocaleSetter locale={initialLocale} />}
        {children}
      </I18nProvider>
    )
  }
  return render(ui, { wrapper: Wrapper, ...rtlOptions })
}
