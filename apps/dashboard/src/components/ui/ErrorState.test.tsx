import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState'

afterEach(cleanup)

describe('ErrorState', () => {
  it('affiche le titre par défaut "Une erreur est survenue"', () => {
    render(<ErrorState message="Boom" />)
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument()
  })

  it('respecte un titre custom', () => {
    render(<ErrorState title="Connexion perdue" message="Boom" />)
    expect(screen.getByText('Connexion perdue')).toBeInTheDocument()
  })

  it('affiche le message', () => {
    render(<ErrorState message="Erreur API 500" />)
    expect(screen.getByText('Erreur API 500')).toBeInTheDocument()
  })

  it('a role="alert" pour les screen readers', () => {
    render(<ErrorState message="X" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('n\'affiche pas le bouton Réessayer sans onRetry', () => {
    render(<ErrorState message="X" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('affiche le bouton Réessayer si onRetry fourni', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="X" onRetry={onRetry} />)
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })

  it('appelle onRetry au clic', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="X" onRetry={onRetry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('respecte retryLabel custom', () => {
    render(<ErrorState message="X" onRetry={() => {}} retryLabel="Tenter à nouveau" />)
    expect(screen.getByRole('button', { name: 'Tenter à nouveau' })).toBeInTheDocument()
  })

  it('a les variants light/dark rose sur le conteneur', () => {
    const { container } = render(<ErrorState message="X" />)
    const alert = container.firstElementChild
    expect(alert).toHaveClass('border-rose-300')
    expect(alert).toHaveClass('bg-rose-50')
    expect(alert).toHaveClass('dark:border-rose-500/30')
  })
})
