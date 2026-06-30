import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Card } from './Card'

afterEach(cleanup)

describe('Card', () => {
  it('affiche les enfants', () => {
    render(<Card>Contenu</Card>)
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it('applique variant default par défaut', () => {
    const { container } = render(<Card>X</Card>)
    const div = container.firstElementChild
    expect(div).toHaveClass('bg-gray-50')
    expect(div).toHaveClass('dark:bg-white/5')
  })

  it('applique variant elevated avec shadow', () => {
    const { container } = render(<Card variant="elevated">X</Card>)
    const div = container.firstElementChild
    expect(div).toHaveClass('bg-white')
    expect(div).toHaveClass('shadow-card')
    expect(div).toHaveClass('dark:shadow-elevated')
  })

  it('applique variant accent (emerald)', () => {
    const { container } = render(<Card variant="accent">X</Card>)
    const div = container.firstElementChild
    expect(div).toHaveClass('bg-emerald-50')
    expect(div).toHaveClass('border-emerald-200')
  })

  it('applique padding md par défaut', () => {
    const { container } = render(<Card>X</Card>)
    expect(container.firstElementChild).toHaveClass('p-4')
  })

  it('applique padding sm/lg/none', () => {
    const { container: c1 } = render(<Card padding="sm">X</Card>)
    expect(c1.firstElementChild).toHaveClass('p-3')

    const { container: c2 } = render(<Card padding="lg">X</Card>)
    expect(c2.firstElementChild).toHaveClass('p-5')

    const { container: c3 } = render(<Card padding="none">X</Card>)
    const div = c3.firstElementChild
    expect(div).not.toHaveClass('p-3')
    expect(div).not.toHaveClass('p-4')
    expect(div).not.toHaveClass('p-5')
  })

  it('a toujours rounded-card + border', () => {
    const { container } = render(<Card>X</Card>)
    const div = container.firstElementChild
    expect(div).toHaveClass('rounded-card')
    expect(div).toHaveClass('border')
  })

  it('forwarde className additionnel', () => {
    const { container } = render(<Card className="custom-extra">X</Card>)
    expect(container.firstElementChild).toHaveClass('custom-extra')
  })

  it('forwarde les props HTML restantes (data-testid)', () => {
    render(<Card data-testid="my-card">X</Card>)
    expect(screen.getByTestId('my-card')).toBeInTheDocument()
  })
})
