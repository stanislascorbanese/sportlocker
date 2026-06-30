/**
 * Tests LanguageSelector — sélecteur FR/EN dans le sidebar.
 *
 * Pipeline testé :
 *  - click sur la langue inactive → setClientLang(lang) + router.refresh()
 *  - click sur la langue déjà active → NO-OP (pas de router.refresh inutile)
 *  - aria-checked reflète la langue courante
 *  - propagation via LANG_CHANGE_EVENT met à jour le rendu
 *
 * Stratégie : on monte le sélecteur DANS un <LangProvider initial="fr">
 * pour reproduire l'environnement réel. On observe les effets de bord
 * (DOM cookie, document.documentElement.lang) côté setClientLang via
 * dispatch d'évent custom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'

const routerRefreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { LanguageSelector } from './LanguageSelector'
import { LangProvider, LANG_CHANGE_EVENT } from '../lib/lang-client'

beforeEach(() => {
  routerRefreshMock.mockReset()
  // Reset l'état du DOM entre tests
  document.documentElement.lang = 'fr'
  document.cookie = 'sportlocker-lang=; path=/; max-age=0'
})

afterEach(cleanup)

describe('LanguageSelector — rendu initial', () => {
  it("affiche les 2 boutons radio FR + EN", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(2)
  })

  it("FR est aria-checked quand la langue initiale est 'fr'", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [fr, en] = screen.getAllByRole('radio')
    expect(fr).toHaveAttribute('aria-checked', 'true')
    expect(en).toHaveAttribute('aria-checked', 'false')
  })

  it("EN est aria-checked quand la langue initiale est 'en'", () => {
    render(
      <LangProvider initial="en">
        <LanguageSelector />
      </LangProvider>,
    )
    const [fr, en] = screen.getAllByRole('radio')
    expect(fr).toHaveAttribute('aria-checked', 'false')
    expect(en).toHaveAttribute('aria-checked', 'true')
  })

  it("aria-label du radiogroup en FR : 'Langue de l’interface'", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    // Curly apostrophe dans le dico — match sur 'Langue' + 'interface'
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName(/Langue.*interface/i)
  })

  it("aria-label du radiogroup en EN : 'Interface language'", () => {
    render(
      <LangProvider initial="en">
        <LanguageSelector />
      </LangProvider>,
    )
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName(/Interface language/i)
  })
})

describe('LanguageSelector — interaction click', () => {
  it("click sur la langue inactive : appelle router.refresh()", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [, en] = screen.getAllByRole('radio')
    fireEvent.click(en!)
    expect(routerRefreshMock).toHaveBeenCalledOnce()
  })

  it("click sur la langue inactive : met à jour document.documentElement.lang", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [, en] = screen.getAllByRole('radio')
    fireEvent.click(en!)
    expect(document.documentElement.lang).toBe('en')
  })

  it("click sur la langue inactive : écrit le cookie sportlocker-lang", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [, en] = screen.getAllByRole('radio')
    fireEvent.click(en!)
    expect(document.cookie).toContain('sportlocker-lang=en')
  })

  it("click sur la langue DÉJÀ active : no-op (pas de router.refresh)", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [fr] = screen.getAllByRole('radio')
    fireEvent.click(fr!)
    expect(routerRefreshMock).not.toHaveBeenCalled()
  })
})

describe('LanguageSelector — propagation événement', () => {
  it("dispatch externe de LANG_CHANGE_EVENT : aria-checked suit", () => {
    render(
      <LangProvider initial="fr">
        <LanguageSelector />
      </LangProvider>,
    )
    const [frBefore, enBefore] = screen.getAllByRole('radio')
    expect(frBefore).toHaveAttribute('aria-checked', 'true')
    expect(enBefore).toHaveAttribute('aria-checked', 'false')

    act(() => {
      window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: 'en' }))
    })

    const [frAfter, enAfter] = screen.getAllByRole('radio')
    expect(enAfter).toHaveAttribute('aria-checked', 'true')
    expect(frAfter).toHaveAttribute('aria-checked', 'false')
  })
})
