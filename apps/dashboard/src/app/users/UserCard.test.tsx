/**
 * Tests UserCard — variante mobile de UserRow.
 *
 * On mocke `useRouter` (next/navigation) et les server actions
 * (`./_actions`) pour pouvoir asserter sur leurs appels sans toucher au
 * backend. Les confirmations `window.confirm` / `prompt` / `alert` sont
 * stubbés via vi.spyOn.
 *
 * Couverture cible :
 *  - Rendu : identité, badges (banned + GDPR), métriques 4 colonnes,
 *    couleurs trust score selon palier (90+ / 60+ / sinon)
 *  - Actions : ban, unban, requestGdpr, cancelGdpr, setRole
 *  - Mode démo : tous les boutons disabled + alert au clic
 *  - i18n FR/EN sur le bouton ban/unban
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { AdminUser } from '../../lib/api'

const routerRefreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

const banUserActionMock = vi.fn()
const unbanUserActionMock = vi.fn()
const setRoleActionMock = vi.fn()
const requestGdprDeleteActionMock = vi.fn()
const cancelGdprDeleteActionMock = vi.fn()

vi.mock('./_actions', () => ({
  banUserAction:                async (...a: unknown[]) => banUserActionMock(...a),
  unbanUserAction:              async (...a: unknown[]) => unbanUserActionMock(...a),
  setRoleAction:                async (...a: unknown[]) => setRoleActionMock(...a),
  requestGdprDeleteAction:      async (...a: unknown[]) => requestGdprDeleteActionMock(...a),
  cancelGdprDeleteAction:       async (...a: unknown[]) => cancelGdprDeleteActionMock(...a),
}))

import { UserCard } from './UserCard'

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    email: 'alice@example.com',
    displayName: 'Alice Martin',
    phone: null,
    role: 'citizen',
    trustScore: 80,
    totalReservations: 12,
    isBanned: false,
    bannedReason: null,
    commune: { id: 'c-1', name: 'Paris 11e' },
    lastActiveAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    gdprDeleteRequestedAt: null,
    gdprDeletedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  routerRefreshMock.mockReset()
  banUserActionMock.mockReset().mockResolvedValue({ ok: true })
  unbanUserActionMock.mockReset().mockResolvedValue({ ok: true })
  setRoleActionMock.mockReset().mockResolvedValue({ ok: true })
  requestGdprDeleteActionMock.mockReset().mockResolvedValue({ ok: true })
  cancelGdprDeleteActionMock.mockReset().mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe('UserCard — rendu', () => {
  it("affiche displayName + email d'un utilisateur normal", () => {
    render(<UserCard user={makeUser()} lang="fr" />)
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it("affiche l'email seul si pas de displayName", () => {
    render(<UserCard user={makeUser({ displayName: null })} lang="fr" />)
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('expose le trust score', () => {
    render(<UserCard user={makeUser({ trustScore: 80 })} lang="fr" />)
    expect(screen.getByText('80')).toBeInTheDocument()
  })

  it('expose le compteur de réservations', () => {
    render(<UserCard user={makeUser({ totalReservations: 42 })} lang="fr" />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it("affiche le nom de la commune (ou — si null)", () => {
    const { rerender } = render(<UserCard user={makeUser()} lang="fr" />)
    expect(screen.getByText('Paris 11e')).toBeInTheDocument()

    rerender(<UserCard user={makeUser({ commune: null })} lang="fr" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('UserCard — état banni', () => {
  it('affiche le badge "banni" en FR', () => {
    render(<UserCard user={makeUser({ isBanned: true })} lang="fr" />)
    expect(screen.getByText('banni')).toBeInTheDocument()
  })

  it('affiche le badge "banned" en EN', () => {
    render(<UserCard user={makeUser({ isBanned: true })} lang="en" />)
    expect(screen.getByText('banned')).toBeInTheDocument()
  })

  it('affiche la raison du ban en italique si présente', () => {
    render(<UserCard user={makeUser({ isBanned: true, bannedReason: 'fraude' })} lang="fr" />)
    expect(screen.getByText(/fraude/)).toBeInTheDocument()
  })

  it("expose le bouton Débannir au lieu de Bannir si banni", () => {
    render(<UserCard user={makeUser({ isBanned: true })} lang="fr" />)
    expect(screen.getByRole('button', { name: /Débannir/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Bannir$/i })).not.toBeInTheDocument()
  })
})

describe('UserCard — état GDPR', () => {
  it("affiche le badge RGPD si gdprDeleteRequestedAt non null", () => {
    render(<UserCard user={makeUser({ gdprDeleteRequestedAt: '2026-01-01T00:00:00Z' })} lang="fr" />)
    expect(screen.getByText('RGPD')).toBeInTheDocument()
  })

  it("expose le bouton Annuler RGPD si demande en cours", () => {
    render(<UserCard user={makeUser({ gdprDeleteRequestedAt: '2026-01-01T00:00:00Z' })} lang="fr" />)
    expect(screen.getByRole('button', { name: /Annuler la demande RGPD/i })).toBeInTheDocument()
  })

  it("expose le bouton Déclencher RGPD si pas de demande", () => {
    render(<UserCard user={makeUser()} lang="fr" />)
    expect(screen.getByRole('button', { name: /Déclencher suppression RGPD/i })).toBeInTheDocument()
  })
})

describe('UserCard — actions', () => {
  it("ban : prompt raison, puis appelle banUserAction", async () => {
    window.prompt = vi.fn().mockReturnValue('motif test')
    render(<UserCard user={makeUser()} lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /^Bannir$/i }))
    await vi.waitFor(() => {
      expect(banUserActionMock).toHaveBeenCalledWith('u-1', 'motif test')
    })
  })

  it("ban : si l'admin clique Annuler dans le prompt, n'appelle PAS l'action", async () => {
    window.prompt = vi.fn().mockReturnValue(null)
    render(<UserCard user={makeUser()} lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /^Bannir$/i }))
    await new Promise((r) => setTimeout(r, 10))
    expect(banUserActionMock).not.toHaveBeenCalled()
  })

  it("unban : confirm puis appelle unbanUserAction", async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<UserCard user={makeUser({ isBanned: true })} lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /Débannir/i }))
    await vi.waitFor(() => {
      expect(unbanUserActionMock).toHaveBeenCalledWith('u-1')
    })
  })

  it("setRole : confirm puis appelle setRoleAction avec le nouveau rôle", async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<UserCard user={makeUser({ role: 'citizen' })} lang="fr" />)

    fireEvent.change(screen.getByDisplayValue('citizen'), { target: { value: 'admin' } })
    await vi.waitFor(() => {
      expect(setRoleActionMock).toHaveBeenCalledWith('u-1', 'admin')
    })
  })

  it("setRole : si nouveau rôle === ancien, n'appelle PAS l'action", async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<UserCard user={makeUser({ role: 'citizen' })} lang="fr" />)

    // Trigger un change avec la même valeur
    fireEvent.change(screen.getByDisplayValue('citizen'), { target: { value: 'citizen' } })
    await new Promise((r) => setTimeout(r, 10))
    expect(setRoleActionMock).not.toHaveBeenCalled()
  })

  it("requestGdpr : confirm puis appelle requestGdprDeleteAction", async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<UserCard user={makeUser()} lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /Déclencher suppression RGPD/i }))
    await vi.waitFor(() => {
      expect(requestGdprDeleteActionMock).toHaveBeenCalledWith('u-1')
    })
  })

  it("cancelGdpr : confirm puis appelle cancelGdprDeleteAction", async () => {
    window.confirm = vi.fn().mockReturnValue(true)
    render(<UserCard user={makeUser({ gdprDeleteRequestedAt: '2026-01-01T00:00:00Z' })} lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /Annuler la demande RGPD/i }))
    await vi.waitFor(() => {
      expect(cancelGdprDeleteActionMock).toHaveBeenCalledWith('u-1')
    })
  })
})

describe('UserCard — mode démo', () => {
  it("ban en démo : alert + n'appelle PAS l'action", async () => {
    const alertSpy = vi.fn()
    window.alert = alertSpy
    render(<UserCard user={makeUser()} demo lang="fr" />)

    fireEvent.click(screen.getByRole('button', { name: /^Bannir$/i }))
    await new Promise((r) => setTimeout(r, 10))

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/démo/i))
    expect(banUserActionMock).not.toHaveBeenCalled()
  })

  it("le role select est disabled en mode démo", () => {
    render(<UserCard user={makeUser()} demo lang="fr" />)
    const select = screen.getByDisplayValue('citizen') as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })
})

describe('UserCard — i18n FR/EN', () => {
  it("affiche le label de rôle en FR sur la métrique Confiance", () => {
    render(<UserCard user={makeUser()} lang="fr" />)
    expect(screen.getByText('Confiance')).toBeInTheDocument()
  })

  it("affiche Trust en EN à la place de Confiance", () => {
    render(<UserCard user={makeUser()} lang="en" />)
    expect(screen.getByText('Trust')).toBeInTheDocument()
    expect(screen.queryByText('Confiance')).not.toBeInTheDocument()
  })
})
