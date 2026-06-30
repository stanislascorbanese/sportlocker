import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { StatusPill } from './StatusPill'

afterEach(cleanup)

describe('StatusPill', () => {
  it('affiche le label du statut online', () => {
    render(<StatusPill status="online" />)
    expect(screen.getByText('online')).toBeInTheDocument()
  })

  it('applique les couleurs emerald pour online', () => {
    const { container } = render(<StatusPill status="online" />)
    const pill = container.querySelector('span')
    expect(pill).toHaveClass('text-emerald-700')
    expect(pill).toHaveClass('dark:text-emerald-300')
    expect(pill).toHaveClass('bg-emerald-50')
    expect(pill).toHaveClass('dark:bg-emerald-500/10')
  })

  it('applique les couleurs rose pour offline', () => {
    const { container } = render(<StatusPill status="offline" />)
    const pill = container.querySelector('span')
    expect(pill).toHaveClass('text-rose-700')
    expect(pill).toHaveClass('dark:text-rose-300')
  })

  it('applique les couleurs amber pour maintenance', () => {
    const { container } = render(<StatusPill status="maintenance" />)
    const pill = container.querySelector('span')
    expect(pill).toHaveClass('text-amber-700')
    expect(pill).toHaveClass('dark:text-amber-300')
  })

  it('applique les couleurs zinc pour decommissioned', () => {
    const { container } = render(<StatusPill status="decommissioned" />)
    const pill = container.querySelector('span')
    expect(pill).toHaveClass('text-zinc-700')
    expect(pill).toHaveClass('dark:text-zinc-300')
  })

  it('contient un dot coloré (variant light + dark)', () => {
    const { container } = render(<StatusPill status="online" />)
    const dot = container.querySelectorAll('span')[1]  // 2e span = dot
    expect(dot).toHaveClass('rounded-full')
    expect(dot).toHaveClass('bg-emerald-500')
    expect(dot).toHaveClass('dark:bg-emerald-400')
  })
})
