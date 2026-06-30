/**
 * Tests ForceCancelButton — bouton admin "annulation forcée" sur le
 * drawer réservation.
 *
 * Couvre :
 *  - Rendu : label idle, label pending, mode démo
 *  - Mode démo : alert + n'appelle PAS l'action
 *  - prompt = null (annule) → n'appelle PAS l'action
 *  - prompt = string → appelle forceCancelReservationAction(id, reason)
 *  - i18n FR/EN sur le label
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const routerRefreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

const forceCancelReservationActionMock = vi.fn()
vi.mock('./_actions', () => ({
  forceCancelReservationAction: async (...a: unknown[]) => forceCancelReservationActionMock(...a),
}))

import { ForceCancelButton } from './ForceCancelButton'

beforeEach(() => {
  routerRefreshMock.mockReset()
  forceCancelReservationActionMock.mockReset().mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe('ForceCancelButton', () => {
  it("affiche 'Annulation forcée' en FR", () => {
    render(<ForceCancelButton id="r-1" lang="fr" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Annulation forcée/i)
  })

  it("affiche 'Force-cancel' en EN", () => {
    render(<ForceCancelButton id="r-1" lang="en" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Force-cancel/i)
  })

  it("est désactivé via le prop disabled", () => {
    render(<ForceCancelButton id="r-1" lang="fr" disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it("mode démo : alert + n'appelle PAS forceCancelReservationAction", async () => {
    const alertSpy = vi.fn()
    window.alert = alertSpy
    render(<ForceCancelButton id="r-1" lang="fr" demo />)

    fireEvent.click(screen.getByRole('button'))
    await new Promise((r) => setTimeout(r, 10))

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/démo/i))
    expect(forceCancelReservationActionMock).not.toHaveBeenCalled()
  })

  it("prompt = null : n'appelle PAS l'action", async () => {
    window.prompt = vi.fn().mockReturnValue(null)
    render(<ForceCancelButton id="r-1" lang="fr" />)

    fireEvent.click(screen.getByRole('button'))
    await new Promise((r) => setTimeout(r, 10))
    expect(forceCancelReservationActionMock).not.toHaveBeenCalled()
  })

  it("prompt = string : appelle l'action avec (id, reason)", async () => {
    window.prompt = vi.fn().mockReturnValue('test reason')
    render(<ForceCancelButton id="r-42" lang="fr" />)

    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(forceCancelReservationActionMock).toHaveBeenCalledWith('r-42', 'test reason')
    })
  })

  it("succès : refresh le router", async () => {
    window.prompt = vi.fn().mockReturnValue('ok')
    render(<ForceCancelButton id="r-1" lang="fr" />)

    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalled()
    })
  })

  it("erreur backend : alert l'erreur + ne refresh PAS le router", async () => {
    window.prompt = vi.fn().mockReturnValue('ok')
    const alertSpy = vi.fn()
    window.alert = alertSpy
    forceCancelReservationActionMock.mockResolvedValueOnce({ ok: false, error: 'forbidden' })

    render(<ForceCancelButton id="r-1" lang="fr" />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('forbidden')
    })
    expect(routerRefreshMock).not.toHaveBeenCalled()
  })
})
