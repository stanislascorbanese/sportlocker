import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ReservationActive } from '../lib/api'
import { renderWithProviders } from '../test/test-utils'
import { ActiveReservationBanner } from './ActiveReservationBanner'

function makeReservation(overrides: Partial<ReservationActive> = {}): ReservationActive {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'pending',
    createdAt: '2026-05-26T10:00:00.000Z',
    expiresAt: '2026-05-26T10:15:00.000Z',
    extensionCount: 0,
    qrToken: 'eyJhbGciOiJIUzI1NiJ9.fake.token',
    distributor: {
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Distributeur test LRSY',
    },
    item: {
      id: '00000000-0000-0000-0000-000000000042',
      typeName: 'Ballon de Foot',
    },
    ...overrides,
  } as ReservationActive
}

describe('ActiveReservationBanner', () => {
  it('affiche le label "à scanner" pour un status pending', () => {
    renderWithProviders(
      <ActiveReservationBanner reservation={makeReservation({ status: 'pending' })} onClick={() => {}} />,
    )
    expect(screen.getByText(/à scanner/i)).toBeInTheDocument()
  })

  it('affiche le label "à venir" pour un status scheduled', () => {
    renderWithProviders(
      <ActiveReservationBanner reservation={makeReservation({ status: 'scheduled' })} onClick={() => {}} />,
    )
    expect(screen.getByText(/à venir/i)).toBeInTheDocument()
  })

  it('affiche le label "en cours" pour un status active', () => {
    renderWithProviders(
      <ActiveReservationBanner reservation={makeReservation({ status: 'active' })} onClick={() => {}} />,
    )
    expect(screen.getByText(/en cours/i)).toBeInTheDocument()
  })

  it('formule "Présente ton QR à HH:MM" pour scheduled', () => {
    renderWithProviders(
      <ActiveReservationBanner
        reservation={makeReservation({ status: 'scheduled' })}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText(/Présente ton QR/)).toBeInTheDocument()
  })

  it('formule "QR valide jusqu\'à HH:MM" pour pending', () => {
    renderWithProviders(
      <ActiveReservationBanner
        reservation={makeReservation({ status: 'pending' })}
        onClick={() => {}}
      />,
    )
    expect(screen.getByText(/QR valide jusqu/)).toBeInTheDocument()
  })

  it('affiche le nom du distributeur et l\'item', () => {
    renderWithProviders(
      <ActiveReservationBanner reservation={makeReservation()} onClick={() => {}} />,
    )
    expect(screen.getByText(/Ballon de Foot/)).toBeInTheDocument()
    expect(screen.getByText(/Distributeur test LRSY/)).toBeInTheDocument()
  })

  it('appelle onClick au tap', async () => {
    const onClick = vi.fn()
    renderWithProviders(
      <ActiveReservationBanner reservation={makeReservation()} onClick={onClick} />,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('rend en EN avec la locale EN', () => {
    renderWithProviders(
      <ActiveReservationBanner
        reservation={makeReservation({ status: 'pending' })}
        onClick={() => {}}
      />,
      { initialLocale: 'en' },
    )
    expect(screen.getByText(/to scan/i)).toBeInTheDocument()
    expect(screen.getByText(/QR valid until/)).toBeInTheDocument()
  })
})
