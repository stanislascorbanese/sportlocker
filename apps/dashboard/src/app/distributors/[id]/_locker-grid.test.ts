import { describe, expect, it } from 'vitest'

import type { DistributorLocker } from '../../../lib/api'
import {
  classifyLocker, loadableLockers, summarizeLockerGrid,
} from './_locker-grid'

function locker(
  position: number,
  state: DistributorLocker['state'],
  withItem = false,
): DistributorLocker {
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${position.toString().padStart(12, '0')}`,
    position,
    state,
    currentItemId: withItem ? `c0bbbbbb-1111-1111-1111-${position.toString().padStart(12, '0')}` : null,
    itemType: withItem
      ? {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
          slug: 'ballon-basket',
          name: 'Ballon de basket',
          category: 'ballon',
          imageUrl: null,
        }
      : null,
  }
}

describe('classifyLocker', () => {
  it('distingue idle-empty (loadable) de idle-loaded (non loadable)', () => {
    expect(classifyLocker(locker(0, 'idle', false))).toMatchObject({
      tone: 'idle-empty', loadable: true,
    })
    expect(classifyLocker(locker(1, 'idle', true))).toMatchObject({
      tone: 'idle-loaded', loadable: false,
    })
  })

  it('mappe directement les états non-idle sur la tone correspondante, jamais loadable', () => {
    const states = ['reserved', 'active', 'returning', 'fault'] as const
    for (const s of states) {
      const cell = classifyLocker(locker(2, s, true))
      expect(cell.tone).toBe(s)
      expect(cell.loadable).toBe(false)
    }
  })

  it('un casier idle sans item est loadable même si l\'API renvoie un itemType orphelin (cas pathologique : currentItemId null prime)', () => {
    const l: DistributorLocker = {
      ...locker(3, 'idle', false),
      itemType: {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        slug: 'x', name: 'x', category: 'x', imageUrl: null,
      },
    }
    expect(classifyLocker(l).loadable).toBe(true)
  })
})

describe('summarizeLockerGrid', () => {
  it('compte chaque tone séparément + total des loadables', () => {
    const grid: DistributorLocker[] = [
      locker(0, 'idle', false),
      locker(1, 'idle', false),
      locker(2, 'idle', true),
      locker(3, 'reserved', true),
      locker(4, 'active', true),
      locker(5, 'returning', true),
      locker(6, 'fault', false),
    ]
    expect(summarizeLockerGrid(grid)).toEqual({
      total: 7,
      idleEmpty: 2,
      idleLoaded: 1,
      reserved: 1,
      active: 1,
      returning: 1,
      fault: 1,
      loadable: 2,
    })
  })

  it('renvoie tout à zéro pour une grille vide', () => {
    expect(summarizeLockerGrid([])).toEqual({
      total: 0, idleEmpty: 0, idleLoaded: 0, reserved: 0, active: 0,
      returning: 0, fault: 0, loadable: 0,
    })
  })
})

describe('loadableLockers', () => {
  it('ne retient que les casiers idle ET vides', () => {
    const grid: DistributorLocker[] = [
      locker(0, 'idle', false),    // ✓
      locker(1, 'idle', true),     // ✗ déjà chargé
      locker(2, 'reserved', false), // ✗ pas idle
      locker(3, 'fault', false),   // ✗ pas idle
      locker(4, 'idle', false),    // ✓
    ]
    const out = loadableLockers(grid)
    expect(out.map((l) => l.position)).toEqual([0, 4])
  })
})
