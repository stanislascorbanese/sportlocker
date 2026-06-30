import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EmptyState } from './EmptyState'

afterEach(cleanup)

describe('EmptyState', () => {
  it('affiche le titre', () => {
    render(<EmptyState title="Aucune réservation" />)
    expect(screen.getByText('Aucune réservation')).toBeInTheDocument()
  })

  it('affiche la description si fournie', () => {
    render(
      <EmptyState
        title="Vide"
        description="Aucune donnée pour ces filtres."
      />,
    )
    expect(screen.getByText('Aucune donnée pour ces filtres.')).toBeInTheDocument()
  })

  it('affiche l\'icône dans un container circulaire', () => {
    render(<EmptyState title="X" icon={<svg data-testid="empty-icon" />} />)
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('affiche l\'action si fournie', () => {
    render(
      <EmptyState
        title="X"
        action={<button type="button">Créer</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument()
  })

  it('a les variants light/dark sur les surfaces', () => {
    const { container } = render(<EmptyState title="X" />)
    const div = container.firstElementChild
    expect(div).toHaveClass('border-gray-200')
    expect(div).toHaveClass('bg-gray-50')
    expect(div).toHaveClass('dark:border-white/10')
    expect(div).toHaveClass('dark:bg-white/5')
  })
})
