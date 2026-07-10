import { describe, expect, it } from 'vitest'

import { fmtEuro, formatDuration } from './format'
import type { MessageKey } from './i18n/messages'

// Stub `t` minimal : ne gère que la clé compacte de jours utilisée par formatDuration.
const t = (key: MessageKey, vars?: Record<string, string | number>): string =>
  key === 'reservation.returned.unit_days' ? `${vars?.count} j` : String(key)

describe('fmtEuro', () => {
  it('formate des centimes en euros (FR)', () => {
    const s = fmtEuro(300, 'fr')
    expect(s).toContain('3,00')
    expect(s).toContain('€')
  })

  it('formate 0 centime', () => {
    expect(fmtEuro(0, 'fr')).toContain('0,00')
  })

  it('formate en EN avec séparateur décimal point', () => {
    expect(fmtEuro(1250, 'en')).toContain('12.50')
  })
})

describe('formatDuration', () => {
  it('minutes seules', () => {
    expect(formatDuration(30, t)).toBe('30 min')
  })

  it('heures pleines sans minutes', () => {
    expect(formatDuration(120, t)).toBe('2 h')
  })

  it('heures + minutes', () => {
    expect(formatDuration(90, t)).toBe('1 h 30 min')
  })

  it('pass journée = 1 jour', () => {
    expect(formatDuration(1440, t)).toBe('1 j')
  })

  it('masque les minutes dès que des jours sont affichés', () => {
    expect(formatDuration(1442, t)).toBe('1 j')
  })

  it('fallback sur 0 min', () => {
    expect(formatDuration(0, t)).toBe('0 min')
  })
})
