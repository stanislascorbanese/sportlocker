import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Package } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { Button, buttonClassName } from './Button'

describe('Button', () => {
  it('rend le children dans un <button> par défaut', () => {
    render(<Button>Réserver</Button>)
    const btn = screen.getByRole('button', { name: 'Réserver' })
    expect(btn).toBeInTheDocument()
    expect(btn.tagName).toBe('BUTTON')
  })

  it('défaut type="button" (anti soumission de formulaire accidentelle)', () => {
    render(<Button>Click</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('disabled : empêche le onClick', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Disabled</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading : remplace icon par Loader2 spin et désactive le bouton', () => {
    const onClick = vi.fn()
    render(
      <Button loading icon={<Package data-testid="icon" />} onClick={onClick}>
        Envoi
      </Button>,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    // Loader2 a la classe animate-spin
    expect(btn.querySelector('.animate-spin')).not.toBeNull()
  })

  it('icon affiché quand pas en loading', () => {
    render(<Button icon={<Package data-testid="icon" />}>Avec icon</Button>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('buttonClassName() expose les classes pour styler un <Link>', () => {
    const classes = buttonClassName({ variant: 'primary', size: 'lg', fullWidth: true })
    expect(classes).toContain('bg-emerald-600')
    expect(classes).toContain('h-12')
    expect(classes).toContain('w-full')
  })

  it('variant=secondary applique la palette gray, pas emerald', () => {
    const classes = buttonClassName({ variant: 'secondary' })
    expect(classes).toContain('bg-white')
    expect(classes).not.toContain('bg-emerald-600')
  })

  it('variant=destructive applique la palette rose', () => {
    const classes = buttonClassName({ variant: 'destructive' })
    expect(classes).toContain('bg-rose-600')
  })

  it('fullWidth=false n\'ajoute pas w-full', () => {
    const classes = buttonClassName({ fullWidth: false })
    expect(classes).not.toContain('w-full')
  })
})
