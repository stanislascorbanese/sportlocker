import { screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Distributor } from '../lib/api'
import { renderWithProviders } from '../test/test-utils'
import { DistributorListItem, type DistributorWithDistance } from './DistributorListItem'

function makeDistributor(overrides: Partial<DistributorWithDistance> = {}): DistributorWithDistance {
  const base: Distributor = {
    id: '00000000-0000-0000-0000-000000000001',
    serialNumber: 'SL-001',
    name: 'Distributeur test LRSY',
    status: 'online',
    communeId: '00000000-0000-0000-0000-000000000099',
    lockerCount: 4,
    idleLockers: 4,
    latitude: 46.67,
    longitude: -1.43,
    addressLine: null,
    batteryPercent: 95,
    lastSeenAt: '2026-05-26T10:00:00.000Z',
  } as Distributor
  return { ...base, distanceKm: null, ...overrides }
}

describe('DistributorListItem', () => {
  it('affiche le nom du distributeur', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor()} onPick={() => {}} />
      </ul>,
    )
    expect(screen.getByText('Distributeur test LRSY')).toBeInTheDocument()
  })

  it('masque la ligne d\'adresse si addressLine est null (pas de fallback GPS)', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor({ addressLine: null })} onPick={() => {}} />
      </ul>,
    )
    // Aucune ligne ne devrait contenir les coordonnées brutes
    expect(screen.queryByText(/46\.67/)).not.toBeInTheDocument()
    expect(screen.queryByText(/-1\.43/)).not.toBeInTheDocument()
  })

  it('affiche la ligne d\'adresse quand addressLine est présent', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem
          d={makeDistributor({ addressLine: '188 Rue de l\'Île Chaland 44115 Basse-Goulaine' })}
          onPick={() => {}}
        />
      </ul>,
    )
    expect(
      screen.getByText('188 Rue de l\'Île Chaland 44115 Basse-Goulaine'),
    ).toBeInTheDocument()
  })

  it('affiche le stock idleLockers / lockerCount dans le badge', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem
          d={makeDistributor({ idleLockers: 3, lockerCount: 5 })}
          onPick={() => {}}
        />
      </ul>,
    )
    expect(screen.getByText('3/5')).toBeInTheDocument()
  })

  it('affiche la distance en m si < 1km', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor({ distanceKm: 0.253 })} onPick={() => {}} />
      </ul>,
    )
    expect(screen.getByText(/253 m/)).toBeInTheDocument()
  })

  it('affiche la distance en km avec virgule décimale en FR', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor({ distanceKm: 1.234 })} onPick={() => {}} />
      </ul>,
    )
    // FR : 1,2 km
    expect(screen.getByText(/1,2 km/)).toBeInTheDocument()
  })

  it('affiche la distance en km avec point décimal en EN', () => {
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor({ distanceKm: 1.234 })} onPick={() => {}} />
      </ul>,
      { initialLocale: 'en' },
    )
    expect(screen.getByText(/1\.2 km/)).toBeInTheDocument()
  })

  it('appelle onPick avec l\'id du distributeur au click', async () => {
    const onPick = vi.fn()
    renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor()} onPick={onPick} />
      </ul>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onPick).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001')
  })

  it('masque la distance quand distanceKm est null', () => {
    const { container } = renderWithProviders(
      <ul>
        <DistributorListItem d={makeDistributor({ distanceKm: null })} onPick={() => {}} />
      </ul>,
    )
    expect(container.textContent).not.toMatch(/km|\d+ m\b/)
  })
})
