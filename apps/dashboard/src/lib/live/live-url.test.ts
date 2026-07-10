import { describe, expect, it } from 'vitest'

import { buildLiveWsUrl } from './live-url'

describe('buildLiveWsUrl', () => {
  it('convertit https → wss et ajoute le ticket', () => {
    const url = buildLiveWsUrl('https://api.sportlocker.fr', { ticket: 'abc' })
    expect(url).toBe('wss://api.sportlocker.fr/v1/admin/live?ticket=abc')
  })

  it('convertit http → ws (dev local)', () => {
    const url = buildLiveWsUrl('http://localhost:3000', { ticket: 'xyz' })
    expect(url).toBe('ws://localhost:3000/v1/admin/live?ticket=xyz')
  })

  it('ajoute le filtre distributorId quand fourni', () => {
    const url = buildLiveWsUrl('https://api.sportlocker.fr', {
      ticket: 't',
      distributorId: 'dist-1',
    })
    expect(url).toContain('ticket=t')
    expect(url).toContain('distributorId=dist-1')
  })

  it('tolère un slash final sur l\'URL de base', () => {
    const url = buildLiveWsUrl('https://api.sportlocker.fr/', { ticket: 't' })
    expect(url).toBe('wss://api.sportlocker.fr/v1/admin/live?ticket=t')
  })

  it('encode les valeurs de query', () => {
    const url = buildLiveWsUrl('https://api.sportlocker.fr', { ticket: 'a/b+c=d' })
    expect(url).toContain('ticket=a%2Fb%2Bc%3Dd')
  })
})
