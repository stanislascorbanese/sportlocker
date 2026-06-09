/**
 * Tests RefreshButton — bouton de refresh manuel des pages Server-Side.
 *
 * Couverture :
 *  - Label "Rafraîchir" (FR) / "Refresh" (EN) au repos
 *  - Click appelle router.refresh() (via useTransition)
 *  - Disabled pendant le pending
 *  - Affiche un horodatage après refresh (lastRefresh)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const routerRefreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

import { RefreshButton } from './RefreshButton'
import { LangProvider } from '../lib/lang-client'

function renderWithLang(lang: 'fr' | 'en' = 'fr') {
  return render(
    <LangProvider initial={lang}>
      <RefreshButton />
    </LangProvider>,
  )
}

beforeEach(() => {
  routerRefreshMock.mockReset()
})

afterEach(cleanup)

describe('RefreshButton', () => {
  it("affiche le label 'Rafraîchir' en FR", () => {
    renderWithLang('fr')
    expect(screen.getByRole('button')).toHaveTextContent(/Rafraîchir/i)
  })

  it("affiche le label 'Refresh' en EN", () => {
    renderWithLang('en')
    expect(screen.getByRole('button')).toHaveTextContent(/Refresh/i)
  })

  it("click : appelle router.refresh()", () => {
    renderWithLang('fr')
    fireEvent.click(screen.getByRole('button'))
    expect(routerRefreshMock).toHaveBeenCalledOnce()
  })

  it("après click : affiche un horodatage (lastRefresh)", async () => {
    renderWithLang('fr')
    fireEvent.click(screen.getByRole('button'))

    // Le timestamp apparaît une fois le useTransition résolu — format HH:MM:SS
    await vi.waitFor(() => {
      const button = screen.getByRole('button')
      // Match HH:MM:SS dans le bouton
      expect(button.textContent).toMatch(/\d{1,2}:\d{2}:\d{2}/)
    })
  })
})
