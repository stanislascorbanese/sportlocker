import { screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../test/test-utils'
import { PushOptInBanner } from './PushOptInBanner'

// Le module push touche aux Web APIs (Notification, ServiceWorker, PushManager)
// absentes de happy-dom → on le mocke entièrement et on pilote les scénarios
// via les valeurs de retour.
vi.mock('../lib/push', () => ({
  detectPushSupport: vi.fn(() => 'supported'),
  currentPermission: vi.fn(() => 'default'),
  getCurrentSubscription: vi.fn(() => Promise.resolve(null)),
  subscribePush: vi.fn(() => Promise.resolve({ ok: true, endpoint: 'https://x' })),
}))

import {
  currentPermission,
  detectPushSupport,
  getCurrentSubscription,
  subscribePush,
} from '../lib/push'

const DISMISS_KEY = 'sl-push-banner-dismissed'
const TITLE = /Active les rappels/i

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(detectPushSupport).mockReturnValue('supported')
  vi.mocked(currentPermission).mockReturnValue('default')
  vi.mocked(getCurrentSubscription).mockResolvedValue(null)
  vi.mocked(subscribePush).mockResolvedValue({ ok: true, endpoint: 'https://x' })
})

describe('PushOptInBanner', () => {
  it('affiche la bannière quand supporté, permission default, sans sub ni dismiss', async () => {
    renderWithProviders(<PushOptInBanner />)
    expect(await screen.findByText(TITLE)).toBeInTheDocument()
  })

  it('ne rend rien si Web Push non supporté', () => {
    vi.mocked(detectPushSupport).mockReturnValue('unsupported')
    const { container } = renderWithProviders(<PushOptInBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien si la permission n\'est plus "default"', () => {
    vi.mocked(currentPermission).mockReturnValue('granted')
    const { container } = renderWithProviders(<PushOptInBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien si déjà écartée (localStorage)', () => {
    window.localStorage.setItem(DISMISS_KEY, '1')
    const { container } = renderWithProviders(<PushOptInBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien si une subscription existe déjà', async () => {
    vi.mocked(getCurrentSubscription).mockResolvedValue({
      endpoint: 'https://x',
    } as unknown as PushSubscription)
    renderWithProviders(<PushOptInBanner />)
    // Laisse la promesse getCurrentSubscription se résoudre.
    await Promise.resolve()
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument()
  })

  it('active les notifications au clic et mémorise le choix', async () => {
    renderWithProviders(<PushOptInBanner />)
    await screen.findByText(TITLE)

    await userEvent.click(screen.getByRole('button', { name: /Activer/i }))

    expect(subscribePush).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Rappels activés/i)).toBeInTheDocument()
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')
  })

  it('se ferme et mémorise le rejet au clic sur la croix', async () => {
    renderWithProviders(<PushOptInBanner />)
    await screen.findByText(TITLE)

    await userEvent.click(screen.getByRole('button', { name: /Fermer/i }))

    await waitFor(() => expect(screen.queryByText(TITLE)).not.toBeInTheDocument())
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe('1')
    expect(subscribePush).not.toHaveBeenCalled()
  })
})
