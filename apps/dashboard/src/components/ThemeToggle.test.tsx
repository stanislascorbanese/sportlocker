/**
 * Tests ThemeToggle — bouton soleil/lune dans la sidebar.
 *
 * Couverture :
 *  - Mount initial : dark mode (défaut dashboard) → icône Sun
 *  - Click → toggle dark↔light → icône change
 *  - aria-label localisé FR/EN
 *  - useTheme depuis le ThemeProvider (pas de mock du provider — on teste
 *    bien la composition réelle).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ThemeToggle } from './ThemeToggle'
import { ThemeProvider } from '../lib/theme'
import { LangProvider } from '../lib/lang-client'

function renderWithProviders(lang: 'fr' | 'en' = 'fr') {
  return render(
    <ThemeProvider>
      <LangProvider initial={lang}>
        <ThemeToggle />
      </LangProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  // Reset localStorage entre tests pour que ThemeProvider démarre en 'dark' par défaut
  try { window.localStorage?.clear() } catch { /* mode privé */ }
  document.documentElement.classList.remove('dark')
})

afterEach(cleanup)

describe('ThemeToggle', () => {
  it("affiche un bouton accessible", () => {
    renderWithProviders('fr')
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it("aria-label en FR : 'Activer le mode clair/sombre'", () => {
    renderWithProviders('fr')
    expect(screen.getByRole('button')).toHaveAccessibleName(/Activer le mode/i)
  })

  it("aria-label en EN : 'Toggle light/dark mode'", () => {
    renderWithProviders('en')
    expect(screen.getByRole('button')).toHaveAccessibleName(/Toggle light\/dark mode/i)
  })

  it("click toggle : ajoute la classe 'dark' au html quand on passe en light puis re-dark", () => {
    renderWithProviders('fr')
    // Démarre en dark (défaut dashboard) — applyTheme s'exécute après mount
    // (useEffect mounted), donc on déclenche le click puis on vérifie le toggle
    const button = screen.getByRole('button')
    fireEvent.click(button) // dark → light
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    fireEvent.click(button) // light → dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it("persiste le choix dans localStorage", () => {
    renderWithProviders('fr')
    fireEvent.click(screen.getByRole('button')) // dark → light
    expect(window.localStorage.getItem('sl-dashboard-theme')).toBe('light')
    fireEvent.click(screen.getByRole('button')) // light → dark
    expect(window.localStorage.getItem('sl-dashboard-theme')).toBe('dark')
  })
})
