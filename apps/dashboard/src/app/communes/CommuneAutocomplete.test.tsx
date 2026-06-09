/**
 * Tests CommuneAutocomplete — champ d'autocomplete branché sur
 * geo.api.gouv.fr (API publique gouv.fr).
 *
 * Couverture :
 *  - Rendu initial : combobox + label + source mention
 *  - Query < 2 caractères : pas de fetch
 *  - Query >= 2 chars : debounce 250ms puis fetch avec param `nom=`
 *  - Query numérique 2-5 chiffres : fetch avec param `codePostal=`
 *  - Résultats affichés en listbox + active option
 *  - mouseDown sur un résultat → appelle onSelect avec CommuneAutofill bien formé
 *  - Keyboard : ArrowDown / ArrowUp navigue, Enter pick, Escape ferme
 *  - i18n FR/EN sur label + placeholder
 *  - Badge "Auto-rempli" visible après pick
 *  - fetch échoue → résultats vidés (silencieux)
 *
 * Stratégie :
 *  - On laisse le timer 250ms tourner pour de vrai et on utilise vi.waitFor
 *    pour attendre que les résultats arrivent (plus fiable que des fake timers
 *    qui interfèrent avec les updates React asynchrones).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CommuneAutocomplete, type CommuneAutofill } from './CommuneAutocomplete'

type GovCommune = {
  nom: string
  code: string
  codesPostaux: string[]
  departement: { code: string; nom: string }
  region: { code: string; nom: string }
  population?: number
}

const PARIS: GovCommune = {
  nom: 'Paris',
  code: '75056',
  codesPostaux: ['75001', '75002'],
  departement: { code: '75', nom: 'Paris' },
  region: { code: '11', nom: 'Île-de-France' },
  population: 2102650,
}

const LYON: GovCommune = {
  nom: 'Lyon',
  code: '69123',
  codesPostaux: ['69001'],
  departement: { code: '69', nom: 'Rhône' },
  region: { code: '84', nom: 'Auvergne-Rhône-Alpes' },
  population: 522969,
}

const originalFetch = globalThis.fetch

function mockFetchResponse(data: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => data,
  })
}

function mockFetchError(status = 500) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  })
}

beforeEach(() => {
  // Pas de fake timers : ils interfèrent avec les flushes React
})

afterEach(() => {
  cleanup()
  globalThis.fetch = originalFetch
})

describe('CommuneAutocomplete — rendu initial', () => {
  it("affiche un combobox + label FR", () => {
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText(/Rechercher une commune/i)).toBeInTheDocument()
  })

  it("affiche le label EN quand lang='en'", () => {
    render(<CommuneAutocomplete lang="en" onSelect={vi.fn()} />)
    expect(screen.getByText(/Search a commune/i)).toBeInTheDocument()
  })

  it("placeholder FR 'Paris 11e, 75011, Lyon…'", () => {
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByPlaceholderText(/Paris 11e/)).toBeInTheDocument()
  })

  it("source 'geo.api.gouv.fr' visible", () => {
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    expect(screen.getByText('geo.api.gouv.fr')).toBeInTheDocument()
  })
})

describe('CommuneAutocomplete — debounce + fetch', () => {
  it("query 1 caractère : pas de fetch (en dessous du seuil)", async () => {
    mockFetchResponse([])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'P' } })
    // Attendre largement plus que le debounce — fetch ne doit pas être appelé
    await new Promise((r) => setTimeout(r, 350))
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("query 'Paris' (>=2 chars) : fetch après debounce avec param 'nom='", async () => {
    mockFetchResponse([PARIS])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paris' } })

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('nom=Paris')
    expect(url).toContain('boost=population')
  })

  it("query '75011' (code postal) : fetch avec param 'codePostal='", async () => {
    mockFetchResponse([PARIS])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '75011' } })

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string
    expect(url).toContain('codePostal=75011')
    expect(url).not.toContain('nom=')
  })

  it("fetch échoue : résultats vidés (silencieux)", async () => {
    mockFetchError(500)
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paris' } })

    // Attendre que le fetch ait été appelé et que finally setLoading(false) tourne
    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled()
    }, { timeout: 1000 })
    // Et qu'il n'y ait pas d'option (résultats vidés)
    await vi.waitFor(() => {
      expect(screen.queryByText(/Recherche…/)).not.toBeInTheDocument()
    }, { timeout: 1000 })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('CommuneAutocomplete — résultats + pick', () => {
  it("affiche les résultats en options après fetch", async () => {
    mockFetchResponse([PARIS, LYON])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Pa' } })

    await vi.waitFor(() => {
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(2)
    }, { timeout: 1000 })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Paris')
    expect(options[1]).toHaveTextContent('Lyon')
  })

  it("première option : aria-selected=true", async () => {
    mockFetchResponse([PARIS, LYON])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Pa' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })

  it("mouseDown sur résultat : appelle onSelect avec CommuneAutofill bien formé", async () => {
    const onSelect = vi.fn<(c: CommuneAutofill) => void>()
    mockFetchResponse([PARIS])
    render(<CommuneAutocomplete lang="fr" onSelect={onSelect} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Pa' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    }, { timeout: 1000 })

    const btn = screen.getAllByRole('option')[0]!.querySelector('button')!
    fireEvent.mouseDown(btn)

    expect(onSelect).toHaveBeenCalledWith({
      inseeCode: '75056',
      postalCode: '75001',
      name: 'Paris',
      department: '75',
      region: 'Île-de-France',
      population: '2102650',
    })
  })

  it("après pick : badge 'Auto-rempli depuis INSEE' visible", async () => {
    mockFetchResponse([PARIS])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Pa' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(1)
    }, { timeout: 1000 })

    fireEvent.mouseDown(screen.getAllByRole('option')[0]!.querySelector('button')!)
    expect(screen.getByText(/Auto-rempli/)).toBeInTheDocument()
  })
})

describe('CommuneAutocomplete — clavier', () => {
  async function setupWithResults(): Promise<HTMLElement> {
    mockFetchResponse([PARIS, LYON])
    render(<CommuneAutocomplete lang="fr" onSelect={vi.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Pa' } })
    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })
    return input
  }

  it("ArrowDown déplace la sélection sur l'option suivante", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it("ArrowDown au bout de la liste : reste sur le dernier", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // déjà au max
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
  })

  it("ArrowUp depuis le second : revient au premier", async () => {
    const input = await setupWithResults()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })

  it("Enter : pick l'option active", async () => {
    const onSelect = vi.fn()
    mockFetchResponse([PARIS, LYON])
    render(<CommuneAutocomplete lang="fr" onSelect={onSelect} />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Pa' } })

    await vi.waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2)
    }, { timeout: 1000 })

    fireEvent.keyDown(input, { key: 'ArrowDown' }) // active = LYON
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lyon' }))
  })

  it("Escape : ferme la dropdown", async () => {
    const input = await setupWithResults()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'Escape' })
    // La listbox disparaît (open=false) — plus d'option visible
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
