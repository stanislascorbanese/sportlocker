import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../test/test-utils'
import { OnboardingSheet } from './OnboardingSheet'

describe('OnboardingSheet', () => {
  it('show au premier mount quand pas de flag localStorage', async () => {
    renderWithProviders(<OnboardingSheet />)

    expect(await screen.findByText('Trouve un distributeur')).toBeInTheDocument()
  })

  it('ne show pas si le flag sl-onboarding-seen est posé', async () => {
    window.localStorage.setItem('sl-onboarding-seen', '1')
    renderWithProviders(<OnboardingSheet />)

    // Attendre un tick pour laisser useEffect tourner
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('Trouve un distributeur')).not.toBeInTheDocument()
  })

  it('Next progresse step 1 → step 2 → step 3', async () => {
    renderWithProviders(<OnboardingSheet />)

    expect(await screen.findByText('Trouve un distributeur')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('Réserve un créneau')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    expect(screen.getByText('Scanne ton QR')).toBeInTheDocument()
  })

  it('dernier step affiche "C\'est parti !" et dismiss au click', async () => {
    renderWithProviders(<OnboardingSheet />)

    await screen.findByText('Trouve un distributeur')
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }))

    const finalBtn = screen.getByRole('button', { name: "C'est parti !" })
    expect(finalBtn).toBeInTheDocument()

    await userEvent.click(finalBtn)

    await waitFor(() => {
      expect(screen.queryByText('Scanne ton QR')).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem('sl-onboarding-seen')).toBe('1')
  })

  it('Skip dismisse et pose le flag à n\'importe quel step', async () => {
    renderWithProviders(<OnboardingSheet />)

    await screen.findByText('Trouve un distributeur')
    await userEvent.click(screen.getByRole('button', { name: 'Passer' }))

    await waitFor(() => {
      expect(screen.queryByText('Trouve un distributeur')).not.toBeInTheDocument()
    })
    expect(window.localStorage.getItem('sl-onboarding-seen')).toBe('1')
  })

  it('respecte la locale EN', async () => {
    renderWithProviders(<OnboardingSheet />, { initialLocale: 'en' })

    expect(await screen.findByText('Find a distributor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })
})
