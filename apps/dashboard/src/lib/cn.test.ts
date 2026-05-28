import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('joint plusieurs classes truthy', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filtre les valeurs falsy (false, null, undefined)', () => {
    expect(cn('a', false, 'b', null, 'c', undefined)).toBe('a b c')
  })

  it('renvoie une chaîne vide si tout est falsy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })

  it('renvoie une chaîne vide si appelé sans argument', () => {
    expect(cn()).toBe('')
  })

  it('garde une classe vide explicite (chaîne vide)', () => {
    // '' est falsy → filtré par filter(Boolean), donc la chaîne vide est
    // bien retirée. Garde-fou : on ne veut pas que '' produise un espace.
    expect(cn('a', '', 'b')).toBe('a b')
  })

  it('supporte les expressions conditionnelles courantes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })
})
