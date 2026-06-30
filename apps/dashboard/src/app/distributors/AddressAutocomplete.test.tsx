/**
 * Tests AddressAutocomplete — autofill adresse via api-adresse.data.gouv.fr (BAN).
 *
 * Utilisé sur /distributors/new et /distributors/[id]/edit pour pré-remplir
 * la position GPS + code postal + ville à partir d'une adresse libre.
 *
 * Couverture :
 *  - Rendu initial : combobox + label FR/EN + source mention
 *  - Query < 3 chars : pas de fetch (seuil plus haut que CommuneAutocomplete
 *    car BAN renvoie peu de résultats pertinents en dessous)
 *  - Query 'rue de la' : fetch BAN avec params autocomplete=1 + limit=8
 *  - Résultats affichés en listbox + active option
 *  - mouseDown sur résultat → onSelect avec lat/lon extraits du GeoJSON
 *  - Navigation clavier ↑↓ Enter Escape
 *  - Badge "Auto-rempli" visible après pick
 *  - fetch échoue / résultat sans `features` → liste vide, silencieux
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { AddressAutocomplete, type AddressAutofill } from './AddressAutocomplete'

type BanFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    label: string
    score: number
    type: 'housenumber' | 'street' | 'locality' | 'municipality'
    postcode?: string
    citycode?: string
    city?: string
  }
}

const RUE_MAIRIE: BanFeature = {
  geometry: { type: 'Point', coordinates: [-1.5037, 47.1985] }, // [lon, lat] Basse-Goulaine
  properties: {
    label: '12 Rue de la Mairie 44115 Basse-Goulaine',
    score: 0.92,
    type: 'housenumber',
    postcode: '44115',
    citycode: '44009',
    city: 'Basse-Goulaine',
  },
}

const PLACE_REPUBLIQUE: BanFeature = {
  geometry: { type: 'Point', coordinates: [2.3631, 48.8676] },
  properties: {
    label: 'Place de la République 75003 Paris',
    score: 0.87,
    type: 'locality',
    postcode: '75003',
    citycode: '75103',
    city: 'Paris',
  },
}

const originalFetch = globalThis.fetch

function mockFetchResponse(features: BanFeature[]) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features }),
  })
}

function mockFetchError(status = 500) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  })
}

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe('AddressAutocomplete — rendu initial', () => {
  it("affiche un combobox + label FR", () => {
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText(/Rechercher une adresse/i)).toBeInTheDocument()
  })

  it("affiche le label EN", () => {
    render(<AddressAutocomplete lang="en" onSelect={vi.fn()} />)
    expect(screen.getByText(/Search an address/i)).toBeInTheDocument()
  })

  it("source 'data.gouv.fr · adresse-api' visible", () => {
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByText(/data\.gouv\.fr · adresse-api/i)).toBeInTheDocument()
  })

  it("placeholder concret '12 rue de la Mairie…'", () => {
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByPlaceholderText(/12 rue de la Mairie/i)).toBeInTheDocument()
  })
})

describe('AddressAutocomplete — debounce + fetch', () => {
  it("query 2 caractères : pas de fetch (sous le seuil 3 chars)", async () => {
    mockFetchResponse([])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ru' } })
    await new Promise((r) => setTimeout(r, 350))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("query 'rue de la' : fetch après debounce avec params BAN", async () => {
    mockFetchResponse([RUE_MAIRIE])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue de la' } })

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('api-adresse.data.gouv.fr')
    expect(url).toContain('autocomplete=1')
    expect(url).toContain('limit=8')
    expect(url).toContain(encodeURIComponent('rue de la'))
  })

  it("fetch échoue : résultats vidés (silencieux)", async () => {
    mockFetchError(500)
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue' } })

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    await vi.waitFor(() => {
      expect(screen.queryByText(/Recherche…/)).not.toBeInTheDocument()
    }, { timeout: 1000 })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it("réponse sans `features` : liste vide", async () => {
    // BAN renvoie parfois `{}` sans features
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'xyz' } })

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('AddressAutocomplete — résultats + pick', () => {
  it("affiche les résultats en options après fetch", async () => {
    mockFetchResponse([RUE_MAIRIE, PLACE_REPUBLIQUE])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })
    expect(screen.getAllByRole('option')[0]).toHaveTextContent(/Basse-Goulaine/)
    expect(screen.getAllByRole('option')[1]).toHaveTextContent(/République/)
  })

  it("première option : aria-selected=true", async () => {
    mockFetchResponse([RUE_MAIRIE, PLACE_REPUBLIQUE])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it("mouseDown : onSelect avec lat/lon extraits du GeoJSON [lon, lat]", async () => {
    const onSelect = vi.fn<(a: AddressAutofill) => void>()
    mockFetchResponse([RUE_MAIRIE])
    render(<AddressAutocomplete lang="fr" onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    }, { timeout: 1000 })

    const btn = screen.getAllByRole('option')[0]!.querySelector('button')!
    fireEvent.mouseDown(btn)

    expect(onSelect).toHaveBeenCalledWith({
      label: '12 Rue de la Mairie 44115 Basse-Goulaine',
      latitude: 47.1985,  // 2e coord du GeoJSON
      longitude: -1.5037, // 1ère coord du GeoJSON
      postcode: '44115',
      citycode: '44009',
      city: 'Basse-Goulaine',
    })
  })

  it("après pick : badge 'Auto-rempli' visible", async () => {
    mockFetchResponse([RUE_MAIRIE])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rue' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    }, { timeout: 1000 })
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!.querySelector('button')!)

    expect(screen.getByText(/Auto-rempli/)).toBeInTheDocument()
  })

  it("postcode/citycode/city manquants : remplit avec '' (fallback)", async () => {
    const onSelect = vi.fn<(a: AddressAutofill) => void>()
    const partialFeature: BanFeature = {
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { label: 'Quelque part', score: 0.1, type: 'locality' },
    }
    mockFetchResponse([partialFeature])
    render(<AddressAutocomplete lang="fr" onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quel' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    }, { timeout: 1000 })
    fireEvent.mouseDown(screen.getAllByRole('option')[0]!.querySelector('button')!)

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Quelque part',
      latitude: 0,
      longitude: 0,
      postcode: '',
      citycode: '',
      city: '',
    })
  })
})

describe('AddressAutocomplete — clavier', () => {
  async function setupWithResults(): Promise<HTMLElement> {
    mockFetchResponse([RUE_MAIRIE, PLACE_REPUBLIQUE])
    render(<AddressAutocomplete lang="fr" onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'rue' } })
    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })
    return input
  }

  it("ArrowDown déplace la sélection", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it("ArrowDown au bout : reste sur le dernier", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
  })

  it("ArrowUp depuis le second : revient au premier", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })

  it("Enter : pick l'option active", async () => {
    const onSelect = vi.fn()
    mockFetchResponse([RUE_MAIRIE, PLACE_REPUBLIQUE])
    render(<AddressAutocomplete lang="fr" onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'rue' } })
    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // active = République
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ city: 'Paris' }))
  })

  it("Escape : ferme la dropdown", async () => {
    const input = await setupWithResults()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
