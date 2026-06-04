import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './Badge'

describe('Badge', () => {
  it('rend un <span> avec le children', () => {
    render(<Badge>4/4</Badge>)
    const badge = screen.getByText('4/4')
    expect(badge).toBeInTheDocument()
    expect(badge.tagName).toBe('SPAN')
  })

  it('tone success applique la palette emerald', () => {
    render(<Badge tone="success">OK</Badge>)
    expect(screen.getByText('OK')).toHaveClass('bg-emerald-100')
  })

  it('tone danger applique la palette rose', () => {
    render(<Badge tone="danger">Erreur</Badge>)
    expect(screen.getByText('Erreur')).toHaveClass('bg-rose-100')
  })

  it('tone warning applique la palette amber', () => {
    render(<Badge tone="warning">⚠</Badge>)
    expect(screen.getByText('⚠')).toHaveClass('bg-amber-100')
  })

  it('tone info applique la palette sky', () => {
    render(<Badge tone="info">i</Badge>)
    expect(screen.getByText('i')).toHaveClass('bg-sky-100')
  })

  it('tone neutral (défaut) applique la palette gray', () => {
    render(<Badge>—</Badge>)
    expect(screen.getByText('—')).toHaveClass('bg-gray-100')
  })

  it('rend l\'icon avant le children', () => {
    render(<Badge icon={<span data-testid="icon">📦</span>}>4/4</Badge>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('4/4')).toBeInTheDocument()
  })

  it('size xs applique text-[10px]', () => {
    render(<Badge size="xs">x</Badge>)
    expect(screen.getByText('x')).toHaveClass('text-[10px]')
  })
})
