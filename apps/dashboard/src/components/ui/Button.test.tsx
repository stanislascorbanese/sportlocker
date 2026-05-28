import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button, buttonClassName } from './Button'

afterEach(cleanup)

describe('buttonClassName', () => {
  it('renvoie les classes de base (variant primary par défaut)', () => {
    const cls = buttonClassName()
    expect(cls).toContain('bg-brand-500')
    expect(cls).toContain('inline-flex')
    expect(cls).toContain('rounded-lg')
  })

  it('applique variant secondary', () => {
    const cls = buttonClassName({ variant: 'secondary' })
    expect(cls).toContain('bg-white')
    expect(cls).toContain('border-gray-200')
    expect(cls).toContain('dark:bg-white/5')
  })

  it('applique variant destructive', () => {
    const cls = buttonClassName({ variant: 'destructive' })
    expect(cls).toContain('bg-rose-600')
  })

  it('applique variant ghost', () => {
    const cls = buttonClassName({ variant: 'ghost' })
    expect(cls).toContain('bg-transparent')
    expect(cls).toContain('hover:bg-gray-100')
  })

  it('applique size sm/md/lg', () => {
    expect(buttonClassName({ size: 'sm' })).toContain('h-9')
    expect(buttonClassName({ size: 'md' })).toContain('h-11')
    expect(buttonClassName({ size: 'lg' })).toContain('h-12')
  })

  it('ajoute w-full si fullWidth', () => {
    expect(buttonClassName({ fullWidth: true })).toContain('w-full')
    expect(buttonClassName({ fullWidth: false })).not.toContain('w-full')
  })
})

describe('Button', () => {
  it('affiche les enfants', () => {
    render(<Button>Valider</Button>)
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('défaut : type=button (évite submit accidentel dans un form)', () => {
    render(<Button>X</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('respecte le type passé en prop', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('déclenche onClick au clic', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('disabled bloque les clics', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick} disabled>Click</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('loading désactive le bouton et masque les enfants visuellement (spinner)', () => {
    render(<Button loading>Charger</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    // Le spinner Loader2 (svg) est rendu, l'icône custom ne l'est pas.
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('affiche l\'icône custom si non-loading', () => {
    render(
      <Button icon={<span data-testid="btn-icon">★</span>}>
        Étoile
      </Button>,
    )
    expect(screen.getByTestId('btn-icon')).toBeInTheDocument()
  })

  it('n\'affiche PAS l\'icône custom quand loading', () => {
    render(
      <Button loading icon={<span data-testid="btn-icon">★</span>}>
        Étoile
      </Button>,
    )
    expect(screen.queryByTestId('btn-icon')).not.toBeInTheDocument()
  })
})
