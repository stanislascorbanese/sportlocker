/**
 * Tests StripeConnectActions — 2 boutons CTA sur la page /settings/payments.
 *
 * Logique testée :
 *  - Onboard button visible sauf si fullyVerified=true
 *  - Refresh button visible seulement si connected=true
 *  - Onboard appelle startOnboardingAction
 *  - Refresh appelle refreshStatusAction
 *  - Labels onboarding différents selon connected (Continuer vs Connecter)
 *  - i18n FR/EN sur les labels CTA
 *
 * `useTransition` est testé indirectement : on vérifie l'invocation des
 * actions (le state pending est difficile à observer sans React Concurrent
 * features stables côté happy-dom — ce serait un faux ami).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const startOnboardingActionMock = vi.fn()
const refreshStatusActionMock = vi.fn()
vi.mock('./_actions', () => ({
  startOnboardingAction: (...a: unknown[]) => startOnboardingActionMock(...a),
  refreshStatusAction:   (...a: unknown[]) => refreshStatusActionMock(...a),
}))

import { StripeConnectActions } from './StripeConnectActions'

beforeEach(() => {
  startOnboardingActionMock.mockReset()
  refreshStatusActionMock.mockReset()
})

afterEach(cleanup)

describe('StripeConnectActions — visibilité conditionnelle', () => {
  it("affiche les 2 boutons quand connected=true & fullyVerified=false", () => {
    render(<StripeConnectActions connected fullyVerified={false} lang="fr" />)
    expect(screen.getByRole('button', { name: /Continuer la vérification/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rafraîchir le statut/i })).toBeInTheDocument()
  })

  it("affiche seulement Onboard quand connected=false (pas encore lié)", () => {
    render(<StripeConnectActions connected={false} fullyVerified={false} lang="fr" />)
    expect(screen.getByRole('button', { name: /Connecter mon compte Stripe/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rafraîchir/i })).not.toBeInTheDocument()
  })

  it("affiche seulement Refresh quand fullyVerified=true", () => {
    render(<StripeConnectActions connected fullyVerified lang="fr" />)
    expect(screen.queryByRole('button', { name: /Connecter|Continuer/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rafraîchir/i })).toBeInTheDocument()
  })
})

describe('StripeConnectActions — i18n FR/EN', () => {
  it("CTA Onboard en FR : 'Connecter mon compte Stripe' si non connecté", () => {
    render(<StripeConnectActions connected={false} fullyVerified={false} lang="fr" />)
    expect(screen.getByText(/Connecter mon compte Stripe/i)).toBeInTheDocument()
  })

  it("CTA Onboard en EN : 'Connect my Stripe account'", () => {
    render(<StripeConnectActions connected={false} fullyVerified={false} lang="en" />)
    expect(screen.getByText(/Connect my Stripe account/i)).toBeInTheDocument()
  })

  it("CTA Onboard FR connecté : 'Continuer la vérification'", () => {
    render(<StripeConnectActions connected fullyVerified={false} lang="fr" />)
    expect(screen.getByText(/Continuer la vérification/i)).toBeInTheDocument()
  })

  it("CTA Refresh FR : 'Rafraîchir le statut'", () => {
    render(<StripeConnectActions connected fullyVerified={false} lang="fr" />)
    expect(screen.getByText(/Rafraîchir le statut/i)).toBeInTheDocument()
  })

  it("CTA Refresh EN : 'Refresh status'", () => {
    render(<StripeConnectActions connected fullyVerified={false} lang="en" />)
    expect(screen.getByText(/Refresh status/i)).toBeInTheDocument()
  })
})

describe('StripeConnectActions — actions', () => {
  it("click Onboard : appelle startOnboardingAction", () => {
    render(<StripeConnectActions connected={false} fullyVerified={false} lang="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /Connecter/i }))
    expect(startOnboardingActionMock).toHaveBeenCalledOnce()
  })

  it("click Refresh : appelle refreshStatusAction", () => {
    render(<StripeConnectActions connected fullyVerified={false} lang="fr" />)
    fireEvent.click(screen.getByRole('button', { name: /Rafraîchir/i }))
    expect(refreshStatusActionMock).toHaveBeenCalledOnce()
  })
})
