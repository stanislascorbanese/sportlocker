import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'

import type { ReservationHistoryItem } from '../../../lib/api'
import { I18nProvider } from '../../../lib/i18n/I18nProvider'
import { ReturnedView } from './page'

// ReturnedView monte ReviewPrompt (useMutation) → besoin d'un QueryClientProvider,
// et useT() → besoin de I18nProvider (locale FR par défaut).
function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  )
}

function returnedItem(overrides: Partial<ReservationHistoryItem> = {}): ReservationHistoryItem {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'returned',
    createdAt: '2026-06-01T09:00:00.000Z',
    expiresAt: '2026-06-01T09:15:00.000Z',
    dueAt: '2026-06-01T10:30:00.000Z',
    openedAt: '2026-06-01T10:00:00.000Z',
    returnedAt: '2026-06-01T10:45:00.000Z',
    extensionCount: 0,
    slotStartAt: null,
    slotEndAt: null,
    durationMinutes: 30,
    priceCents: 300,
    distributor: { id: '00000000-0000-0000-0000-000000000099', name: 'Parc des Sports' },
    item: { id: '00000000-0000-0000-0000-000000000042', typeName: 'Ballon de Foot' },
    ...overrides,
  }
}

describe('ReturnedView', () => {
  it('affiche les instructions, la durée réelle et le montant débité', () => {
    render(<ReturnedView r={returnedItem()} />, { wrapper: Providers })
    // Instructions de retour
    expect(screen.getByText(/Matériel rendu et casier verrouillé/i)).toBeInTheDocument()
    // Durée réelle (10:00 → 10:45 = 45 min), pas la durée du créneau (30)
    expect(screen.getByText('45 min')).toBeInTheDocument()
    // Montant débité
    expect(screen.getByText(/3,00/)).toBeInTheDocument()
    // Distributeur + item
    expect(screen.getByText('Parc des Sports')).toBeInTheDocument()
    expect(screen.getByText('Ballon de Foot')).toBeInTheDocument()
  })

  it('signale la pénalité de trust score quand le retour est en retard', () => {
    render(<ReturnedView r={returnedItem()} />, { wrapper: Providers })
    expect(screen.getByText(/Rendu en retard/i)).toBeInTheDocument()
    expect(screen.getByText(/score de confiance/i)).toBeInTheDocument()
  })

  it('n\'affiche pas de pénalité quand le retour est à l\'heure', () => {
    render(
      <ReturnedView r={returnedItem({ returnedAt: '2026-06-01T10:15:00.000Z' })} />,
      { wrapper: Providers },
    )
    expect(screen.queryByText(/Rendu en retard/i)).not.toBeInTheDocument()
  })

  it('masque durée et montant pour une résa sans données de prix/temps', () => {
    render(
      <ReturnedView
        r={returnedItem({ openedAt: null, returnedAt: null, durationMinutes: null, priceCents: null, dueAt: null })}
      />,
      { wrapper: Providers },
    )
    expect(screen.queryByText(/Durée de l'emprunt/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Montant débité/i)).not.toBeInTheDocument()
  })
})
