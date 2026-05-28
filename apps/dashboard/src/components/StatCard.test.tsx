import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatCard } from './StatCard'

afterEach(cleanup)

describe('StatCard', () => {
  it('affiche label + value', () => {
    render(<StatCard label="Distributeurs" value={42} />)
    expect(screen.getByText('Distributeurs')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('affiche le hint si fourni', () => {
    render(<StatCard label="X" value={1} hint="≥ 30 jours" />)
    expect(screen.getByText('≥ 30 jours')).toBeInTheDocument()
  })

  it('n\'affiche pas hint si absent', () => {
    const { container } = render(<StatCard label="X" value={1} />)
    // Le hint est dans un <p> avec text-xs ; pas d'élément avec cette classe.
    expect(container.querySelectorAll('p')).toHaveLength(2)  // label + value
  })

  it('applique tone neutral par défaut', () => {
    const { container } = render(<StatCard label="L" value="V" />)
    const valueEl = container.querySelectorAll('p')[1]
    expect(valueEl).toHaveClass('text-navy-900')
    expect(valueEl).toHaveClass('dark:text-white')
  })

  it('applique tone good (emerald)', () => {
    const { container } = render(<StatCard label="L" value="V" tone="good" />)
    const valueEl = container.querySelectorAll('p')[1]
    expect(valueEl).toHaveClass('text-emerald-700')
    expect(valueEl).toHaveClass('dark:text-emerald-300')
  })

  it('applique tone warn (amber)', () => {
    const { container } = render(<StatCard label="L" value="V" tone="warn" />)
    const valueEl = container.querySelectorAll('p')[1]
    expect(valueEl).toHaveClass('text-amber-700')
  })

  it('applique tone bad (rose)', () => {
    const { container } = render(<StatCard label="L" value="V" tone="bad" />)
    const valueEl = container.querySelectorAll('p')[1]
    expect(valueEl).toHaveClass('text-rose-700')
  })

  it('wrap en <a> si href fourni', () => {
    render(<StatCard label="L" value="V" href="/distributors" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/distributors')
    expect(screen.getByText('détails →')).toBeInTheDocument()
  })

  it('pas de <a> si href absent', () => {
    render(<StatCard label="L" value="V" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText('détails →')).not.toBeInTheDocument()
  })

  it('affiche l\'icône si fournie', () => {
    render(<StatCard label="L" value="V" icon={<span data-testid="kpi-icon">🛠</span>} />)
    expect(screen.getByTestId('kpi-icon')).toBeInTheDocument()
  })
})
