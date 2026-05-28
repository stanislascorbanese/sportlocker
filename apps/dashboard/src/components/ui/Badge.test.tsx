import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Badge } from './Badge'

afterEach(cleanup)

describe('Badge', () => {
  it('affiche le contenu textuel', () => {
    render(<Badge>Online</Badge>)
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('applique le tone neutral par défaut', () => {
    const { container } = render(<Badge>Default</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-gray-700')
    expect(span).toHaveClass('dark:text-white/70')
  })

  it('applique le tone success', () => {
    const { container } = render(<Badge tone="success">OK</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-emerald-800')
    expect(span).toHaveClass('dark:text-emerald-200')
  })

  it('applique le tone warning', () => {
    const { container } = render(<Badge tone="warning">Attention</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-amber-800')
  })

  it('applique le tone danger', () => {
    const { container } = render(<Badge tone="danger">Erreur</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-rose-800')
  })

  it('applique la taille sm par défaut', () => {
    const { container } = render(<Badge>X</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('px-2.5')
  })

  it('applique la taille xs si demandé', () => {
    const { container } = render(<Badge size="xs">X</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('px-2')
    expect(span).toHaveClass('py-0.5')
  })

  it('affiche une icône si fournie', () => {
    render(
      <Badge icon={<svg data-testid="badge-icon" />}>
        Avec icône
      </Badge>,
    )
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument()
  })

  it('forwarde className additionnel', () => {
    const { container } = render(<Badge className="custom-extra">X</Badge>)
    const span = container.querySelector('span')
    expect(span).toHaveClass('custom-extra')
  })

  it('forwarde les props HTML restantes (aria-label)', () => {
    render(<Badge aria-label="badge accessible">X</Badge>)
    const span = screen.getByLabelText('badge accessible')
    expect(span).toBeInTheDocument()
  })
})
