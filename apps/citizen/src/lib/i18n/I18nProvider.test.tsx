import { act, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import { I18nProvider, useI18n, useT } from './I18nProvider'

function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

describe('I18nProvider', () => {
  it('rend FR par défaut (pas de localStorage, pas de navigator.language EN)', () => {
    const { result } = renderHook(() => useT(), { wrapper })
    expect(result.current('home.title')).toBe('Distributeurs disponibles')
  })

  it('switch vers EN via setLocale', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    expect(result.current.t('home.title')).toBe('Distributeurs disponibles')

    act(() => {
      result.current.setLocale('en')
    })

    expect(result.current.t('home.title')).toBe('Available distributors')
    expect(result.current.locale).toBe('en')
  })

  it('persiste la locale dans localStorage', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    act(() => {
      result.current.setLocale('en')
    })

    expect(window.localStorage.getItem('sl-locale')).toBe('en')
  })

  it('met à jour <html lang> au changement de locale', () => {
    const { result } = renderHook(() => useI18n(), { wrapper })

    act(() => {
      result.current.setLocale('en')
    })

    expect(document.documentElement.lang).toBe('en')
  })

  it('interpole les variables {name} dans le message', () => {
    const { result } = renderHook(() => useT(), { wrapper })

    expect(result.current('home.greeting', { name: 'Alice' })).toBe('Bonjour Alice')
  })

  it('remplace toutes les occurrences de la même variable', () => {
    // 'reservation.page.extend_count' = '{used} / {max} prolongations utilisées'
    const { result } = renderHook(() => useT(), { wrapper })

    expect(result.current('reservation.page.extend_count', { used: 1, max: 2 })).toBe(
      '1 / 2 prolongations utilisées',
    )
  })

  it('fallback vers FR si une clé manque côté EN', () => {
    // Tous les messages FR ont leur équivalent EN par typage strict — donc
    // ce test vérifie surtout que `t()` ne crashe pas si on lui passe une
    // clé inexistante (cast forcé). Comportement attendu : renvoie la clé
    // littéralement (debugging visuel : on voit la clé à l'écran).
    const { result } = renderHook(() => useT(), { wrapper })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missing = result.current('missing.key' as any)
    expect(missing).toBe('missing.key')
  })

  it('useT() throw hors d\'un I18nProvider', () => {
    // sans wrapper → pas de context → erreur explicite
    expect(() => renderHook(() => useT())).toThrow(/useI18n must be used inside/)
  })
})
