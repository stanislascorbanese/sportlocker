/**
 * Tests ResetPasswordButton — bouton "changer mot de passe" sur /me.
 *
 * Couvre les 4 états :
 *  - idle : bouton "Changer mon mot de passe" (FR) / "Change my password" (EN)
 *  - sending : bouton disabled, label "Envoi en cours…"
 *  - sent : remplace le bouton par un message "Email envoyé à <email>"
 *  - error : message d'erreur sous le bouton + détail HTTP
 *
 * Mocke `fetch` global pour simuler les réponses /api/password-reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ResetPasswordButton } from './ResetPasswordButton'

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe('ResetPasswordButton', () => {
  it("affiche 'Changer mon mot de passe' en FR au repos", () => {
    render(<ResetPasswordButton email="alice@example.com" lang="fr" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Changer mon mot de passe/i)
  })

  it("affiche 'Change my password' en EN", () => {
    render(<ResetPasswordButton email="alice@example.com" lang="en" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Change my password/i)
  })

  it("click : POST /api/password-reset avec l'email", async () => {
    render(<ResetPasswordButton email="alice@example.com" lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/password-reset',
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'alice@example.com' }),
        }),
      )
    })
  })

  it("succès : remplace le bouton par 'Email envoyé à <email>'", async () => {
    render(<ResetPasswordButton email="alice@example.com" lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByText(/Email envoyé à/i)).toBeInTheDocument()
      expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    })
    // Le bouton disparaît au profit de la success view
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it("succès en EN : 'Email sent to <email>'", async () => {
    render(<ResetPasswordButton email="bob@example.com" lang="en" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByText(/Email sent to/i)).toBeInTheDocument()
    })
  })

  it("HTTP 500 : affiche le détail d'erreur 'HTTP 500'", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    render(<ResetPasswordButton email="alice@example.com" lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      // Apostrophe curly (’) dans le dico, on match sur "Échec" + "envoi"
      expect(screen.getByText(/Échec de.*envoi du mail/i)).toBeInTheDocument()
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
    })
    // Le bouton revient affichable (état 'error', pas 'sent')
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it("network error : affiche le message d'erreur natif", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))
    render(<ResetPasswordButton email="alice@example.com" lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByText(/Failed to fetch/)).toBeInTheDocument()
    })
  })
})
