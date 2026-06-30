/**
 * Tests pour LangProvider + useLang + setClientLang.
 *
 * Couvre le pipeline :
 *   - setClientLang met à jour <html lang>, pose le cookie, dispatch l'event
 *   - LangProvider écoute l'event et re-render les enfants avec la bonne lang
 *   - useLang renvoie la valeur du Context
 *
 * Pas de test de `router.refresh()` ici (composant LanguageSelector externe).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

import { LANG_COOKIE, LANG_CHANGE_EVENT, LangProvider, setClientLang, useLang } from './lang-client'

function ProbeLang() {
  const lang = useLang()
  return <span data-testid="probe">{lang}</span>
}

describe('LangProvider + useLang', () => {
  beforeEach(() => {
    document.cookie = `${LANG_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    document.documentElement.lang = ''
  })

  afterEach(() => {
    cleanup()
  })

  it('exposes the initial lang via useLang', () => {
    const { getByTestId } = render(
      <LangProvider initial="fr">
        <ProbeLang />
      </LangProvider>,
    )
    expect(getByTestId('probe').textContent).toBe('fr')
  })

  it('exposes en as initial', () => {
    const { getByTestId } = render(
      <LangProvider initial="en">
        <ProbeLang />
      </LangProvider>,
    )
    expect(getByTestId('probe').textContent).toBe('en')
  })

  it('updates lang when LANG_CHANGE_EVENT fires with valid lang', () => {
    const { getByTestId } = render(
      <LangProvider initial="fr">
        <ProbeLang />
      </LangProvider>,
    )
    expect(getByTestId('probe').textContent).toBe('fr')

    act(() => {
      window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: 'en' }))
    })

    expect(getByTestId('probe').textContent).toBe('en')
  })

  it('ignores LANG_CHANGE_EVENT with invalid lang', () => {
    const { getByTestId } = render(
      <LangProvider initial="fr">
        <ProbeLang />
      </LangProvider>,
    )

    act(() => {
      window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: 'xyz' }))
    })

    // Reste à fr puisque 'xyz' n'est pas une lang valide
    expect(getByTestId('probe').textContent).toBe('fr')
  })
})

describe('setClientLang', () => {
  beforeEach(() => {
    document.cookie = `${LANG_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    document.documentElement.lang = ''
  })

  it('sets document.documentElement.lang', () => {
    setClientLang('en')
    expect(document.documentElement.lang).toBe('en')

    setClientLang('fr')
    expect(document.documentElement.lang).toBe('fr')
  })

  it('writes the cookie with the lang value', () => {
    setClientLang('en')
    expect(document.cookie).toContain(`${LANG_COOKIE}=en`)
  })

  it('cookie is overwritten on subsequent calls', () => {
    setClientLang('en')
    setClientLang('fr')
    expect(document.cookie).toContain(`${LANG_COOKIE}=fr`)
    expect(document.cookie).not.toContain(`${LANG_COOKIE}=en`)
  })

  it('dispatches LANG_CHANGE_EVENT with the new lang as detail', () => {
    let captured: string | null = null
    const handler = (e: Event) => {
      captured = (e as CustomEvent<string>).detail
    }
    window.addEventListener(LANG_CHANGE_EVENT, handler)

    setClientLang('en')

    window.removeEventListener(LANG_CHANGE_EVENT, handler)
    expect(captured).toBe('en')
  })

  it('triggers re-render of LangProvider children when called', () => {
    const { getByTestId } = render(
      <LangProvider initial="fr">
        <ProbeLang />
      </LangProvider>,
    )

    act(() => {
      setClientLang('en')
    })

    expect(getByTestId('probe').textContent).toBe('en')
  })
})
