import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Skeleton } from './Skeleton'

afterEach(cleanup)

describe('Skeleton', () => {
  it('a role="status" + aria-label pour les screen readers', () => {
    render(<Skeleton />)
    const sk = screen.getByRole('status')
    expect(sk).toHaveAttribute('aria-label', 'Chargement')
  })

  it('applique animate-shimmer + gradient light/dark', () => {
    render(<Skeleton />)
    const sk = screen.getByRole('status')
    expect(sk).toHaveClass('animate-shimmer')
    expect(sk).toHaveClass('from-gray-100')
    expect(sk).toHaveClass('dark:from-white/5')
  })

  it('applique rounded md par défaut', () => {
    render(<Skeleton />)
    expect(screen.getByRole('status')).toHaveClass('rounded-lg')
  })

  it('applique rounded full / card / sm si demandé', () => {
    const { rerender } = render(<Skeleton rounded="full" />)
    expect(screen.getByRole('status')).toHaveClass('rounded-full')

    rerender(<Skeleton rounded="card" />)
    expect(screen.getByRole('status')).toHaveClass('rounded-card')

    rerender(<Skeleton rounded="sm" />)
    expect(screen.getByRole('status')).toHaveClass('rounded')
  })

  it('applique width et height via style inline', () => {
    render(<Skeleton width={200} height="3rem" />)
    const sk = screen.getByRole('status')
    expect(sk.style.width).toBe('200px')
    expect(sk.style.height).toBe('3rem')
  })

  it('forwarde className additionnel', () => {
    render(<Skeleton className="custom" />)
    expect(screen.getByRole('status')).toHaveClass('custom')
  })
})
