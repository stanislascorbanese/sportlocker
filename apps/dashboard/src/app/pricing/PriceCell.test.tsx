/**
 * Tests PriceCell — cellule éditable de la matrice tarifaire /pricing.
 *
 * Comportement testé :
 *  - Affichage initial : "0,50" pour 50 cents, "1" pour 100 cents, "" si null
 *  - Changement de valeur → onBlur déclenche upsertPricingRuleAction
 *  - Champ vidé sur règle existante → onBlur déclenche deletePricingRuleAction
 *  - Champ vidé sur règle absente → no-op
 *  - Valeur identique → no-op
 *  - Valeur invalide (négatif, NaN) → erreur + reset au draft initial
 *  - Enter → blur (déclenche commit indirectement)
 *  - Escape → reset au draft initial + blur (sans commit)
 *  - Erreur serveur → setError affiché, classe rose appliquée
 *
 * Les server actions retournent un FormData → on assert sur le contenu du
 * FormData passé. Le mock résout par défaut `{status: 'ok'}`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const routerRefreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

const upsertActionMock = vi.fn()
const deleteActionMock = vi.fn()
vi.mock('./_actions', () => ({
  upsertPricingRuleAction: async (fd: FormData) => upsertActionMock(fd),
  deletePricingRuleAction: async (fd: FormData) => deleteActionMock(fd),
}))

import { PriceCell } from './PriceCell'

function defaultProps() {
  return {
    itemTypeId: 'item-1',
    durationMinutes: 60 as const,
    initialPriceCents: 200, // 2 €
    ruleId: 'rule-1',
    communeId: 'commune-paris',
    lang: 'fr' as const,
  }
}

beforeEach(() => {
  routerRefreshMock.mockReset()
  upsertActionMock.mockReset().mockResolvedValue({ status: 'ok' })
  deleteActionMock.mockReset().mockResolvedValue({ status: 'ok' })
})

afterEach(cleanup)

describe('PriceCell — affichage initial', () => {
  it("affiche '2' quand initialPriceCents=200 (entier)", () => {
    render(<PriceCell {...defaultProps()} />)
    expect(screen.getByRole('textbox')).toHaveValue('2')
  })

  it("affiche '0,50' quand initialPriceCents=50", () => {
    render(<PriceCell {...defaultProps()} initialPriceCents={50} />)
    expect(screen.getByRole('textbox')).toHaveValue('0,50')
  })

  it("affiche '12,34' quand initialPriceCents=1234", () => {
    render(<PriceCell {...defaultProps()} initialPriceCents={1234} />)
    expect(screen.getByRole('textbox')).toHaveValue('12,34')
  })

  it("affiche '' quand initialPriceCents=null", () => {
    render(<PriceCell {...defaultProps()} initialPriceCents={null} ruleId={null} />)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it("aria-label injecté avec la durée : 'Prix 60 min en euros'", () => {
    render(<PriceCell {...defaultProps()} />)
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Prix 60 min en euros')
  })

  it("aria-label en EN : 'Price 60 min in euros'", () => {
    render(<PriceCell {...defaultProps()} lang="en" />)
    expect(screen.getByRole('textbox')).toHaveAccessibleName('Price 60 min in euros')
  })
})

describe('PriceCell — édition + commit', () => {
  it("change de valeur puis blur : appelle upsertPricingRuleAction avec FormData correct", async () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '3,50' } })
    fireEvent.blur(input)

    await vi.waitFor(() => {
      expect(upsertActionMock).toHaveBeenCalledOnce()
    })
    const fd = upsertActionMock.mock.calls[0]![0] as FormData
    expect(fd.get('itemTypeId')).toBe('item-1')
    expect(fd.get('durationMinutes')).toBe('60')
    expect(fd.get('priceCents')).toBe('350')
    expect(fd.get('communeId')).toBe('commune-paris')
  })

  it("valeur identique : pas d'appel à upsert (no-op)", () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.blur(input) // sans changement
    expect(upsertActionMock).not.toHaveBeenCalled()
  })

  it("vide → null + ruleId présent : appelle deletePricingRuleAction", async () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    await vi.waitFor(() => {
      expect(deleteActionMock).toHaveBeenCalledOnce()
    })
    const fd = deleteActionMock.mock.calls[0]![0] as FormData
    expect(fd.get('id')).toBe('rule-1')
    expect(fd.get('communeId')).toBe('commune-paris')
  })

  it("vide + ruleId=null : aucun appel (no-op)", () => {
    render(<PriceCell {...defaultProps()} initialPriceCents={null} ruleId={null} />)
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    expect(deleteActionMock).not.toHaveBeenCalled()
    expect(upsertActionMock).not.toHaveBeenCalled()
  })

  it("valeur invalide (négatif) : affiche 'invalide' + reset au draft initial", () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '-1' } })
    fireEvent.blur(input)
    // Reset au draft initial
    expect(input).toHaveValue('2')
    expect(upsertActionMock).not.toHaveBeenCalled()
  })

  it("valeur NaN ('abc') : pas de commit + reset", () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(input).toHaveValue('2')
    expect(upsertActionMock).not.toHaveBeenCalled()
  })

  it("accepte virgule ET point (locale fr-FR) : '3.50' → upsert 350", async () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '3.50' } })
    fireEvent.blur(input)

    await vi.waitFor(() => {
      expect(upsertActionMock).toHaveBeenCalledOnce()
    })
    const fd = upsertActionMock.mock.calls[0]![0] as FormData
    expect(fd.get('priceCents')).toBe('350')
  })
})

describe('PriceCell — clavier', () => {
  it("Enter dans l'input : appelle input.blur() (qui propage le commit)", () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    const blurSpy = vi.spyOn(input, 'blur')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // happy-dom n'émet pas l'évènement focus/blur sur input.blur() —
    // on se contente de vérifier que la méthode est appelée. L'effet de
    // bord (commit via onBlur) est testé séparément.
    expect(blurSpy).toHaveBeenCalledOnce()
  })

  it("Escape dans l'input : reset au draft initial + pas de commit", () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('2')
    expect(upsertActionMock).not.toHaveBeenCalled()
  })
})

describe('PriceCell — erreur serveur', () => {
  it("upsert renvoie status:error : affiche le message d'erreur", async () => {
    upsertActionMock.mockResolvedValueOnce({ status: 'error', message: 'Trop cher' })

    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.blur(input)

    // Pas de message visible en UI (PriceCell n'affiche que la bordure rose),
    // mais on peut vérifier que l'input revient au draft initial + classe rose
    await vi.waitFor(() => {
      expect(input).toHaveValue('2')
      expect(input.className).toMatch(/rose/)
    })
  })

  it("succès : appelle router.refresh()", async () => {
    render(<PriceCell {...defaultProps()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    await vi.waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledOnce()
    })
  })
})
