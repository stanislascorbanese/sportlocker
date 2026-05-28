import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PageHeader } from './PageHeader'

afterEach(cleanup)

describe('PageHeader', () => {
  it('affiche le titre comme h1', () => {
    render(<PageHeader title="Paramètres" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument()
  })

  it('affiche l\'eyebrow si fourni', () => {
    render(<PageHeader title="X" eyebrow="ADMIN" />)
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
  })

  it('affiche la description si fournie', () => {
    render(<PageHeader title="X" description="Gérer les paramètres globaux" />)
    expect(screen.getByText('Gérer les paramètres globaux')).toBeInTheDocument()
  })

  it('affiche l\'icône dans un container coloré brand', () => {
    render(<PageHeader title="X" icon={<svg data-testid="ph-icon" />} />)
    expect(screen.getByTestId('ph-icon')).toBeInTheDocument()
  })

  it('affiche les actions dans le slot droit', () => {
    render(
      <PageHeader
        title="X"
        actions={<button type="button">Action</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('ne crée pas de container actions si aucune action', () => {
    const { container } = render(<PageHeader title="X" />)
    // Le header n'a qu'un seul enfant direct (le bloc gauche).
    expect(container.querySelector('header')?.children).toHaveLength(1)
  })

  it('forwarde className additionnel', () => {
    const { container } = render(<PageHeader title="X" className="custom" />)
    expect(container.querySelector('header')).toHaveClass('custom')
  })
})
