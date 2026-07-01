import { describe, expect, it } from 'vitest'

import type { DistributorLocker, LiveLockerEvent } from '@sportlocker/types'

import { applyLockerEvent } from './apply-locker-event'

function locker(id: string, position: number, state: DistributorLocker['state']): DistributorLocker {
  return { id, position, state, currentItemId: null, itemType: null }
}

function lockerEvent(l: DistributorLocker): LiveLockerEvent {
  return {
    v: 1,
    kind: 'locker',
    distributorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    communeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    eventType: 'reserved',
    locker: l,
    at: '2026-06-30T10:00:00.000Z',
  }
}

const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('applyLockerEvent', () => {
  it('remplace la cellule ciblée par le nouvel état', () => {
    const initial = [locker(L1, 0, 'idle'), locker(L2, 1, 'idle')]
    const next = applyLockerEvent(initial, lockerEvent(locker(L1, 0, 'reserved')))
    expect(next[0]!.state).toBe('reserved')
    expect(next[1]!.state).toBe('idle')
  })

  it('ne mute pas le tableau d\'entrée (immutabilité)', () => {
    const initial = [locker(L1, 0, 'idle')]
    applyLockerEvent(initial, lockerEvent(locker(L1, 0, 'active')))
    expect(initial[0]!.state).toBe('idle')
  })

  it('renvoie la MÊME référence si l\'état est inchangé (event rejoué)', () => {
    const initial = [locker(L1, 0, 'reserved')]
    const next = applyLockerEvent(initial, lockerEvent(locker(L1, 0, 'reserved')))
    expect(next).toBe(initial)
  })

  it('insère un casier inconnu en respectant l\'ordre de position', () => {
    const initial = [locker(L1, 0, 'idle'), locker(L2, 2, 'idle')]
    const inserted = locker('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'fault')
    const next = applyLockerEvent(initial, lockerEvent(inserted))
    expect(next.map((l) => l.position)).toEqual([0, 1, 2])
    expect(next[1]!.state).toBe('fault')
  })
})
