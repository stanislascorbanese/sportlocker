import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SuccessCheck } from './SuccessCheck'

describe('SuccessCheck', () => {
  it('expose un rôle img avec le label fourni', () => {
    render(<SuccessCheck label="Paiement confirmé" />)
    expect(screen.getByRole('img', { name: 'Paiement confirmé' })).toBeInTheDocument()
  })

  it('est purement décoratif (aria-hidden) sans label', () => {
    const { container } = render(<SuccessCheck />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    // Cercle + coche, chacun animé via le tracé progressif.
    expect(container.querySelectorAll('.animate-draw')).toHaveLength(2)
  })
})
