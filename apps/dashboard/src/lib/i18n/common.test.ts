import { describe, expect, it } from 'vitest'

import {
  commonStrings,
  dateLocale,
  distributorStatusLabel,
  fmtRelative,
  fmtDateShort,
  fmtDateTime,
  fmtToday,
} from './common'

describe('commonStrings', () => {
  it('returns FR strings with key cohérence', () => {
    const t = commonStrings('fr')
    expect(t.demo).toBe('Démo')
    expect(t.refresh).toBe('Rafraîchir')
    expect(t.cancel).toBe('Annuler')
    expect(t.save).toBe('Enregistrer')
    expect(t.statusOnline).toBe('en ligne')
    expect(t.statusOffline).toBe('hors ligne')
    expect(t.statusDecommissioned).toBe('désactivé')
  })

  it('returns EN strings', () => {
    const t = commonStrings('en')
    expect(t.demo).toBe('Demo')
    expect(t.refresh).toBe('Refresh')
    expect(t.cancel).toBe('Cancel')
    expect(t.save).toBe('Save')
    expect(t.statusOnline).toBe('online')
    expect(t.statusOffline).toBe('offline')
    expect(t.statusDecommissioned).toBe('decommissioned')
  })

  it('FR and EN have exactly the same keys (parity)', () => {
    const frKeys = Object.keys(commonStrings('fr')).sort()
    const enKeys = Object.keys(commonStrings('en')).sort()
    expect(enKeys).toEqual(frKeys)
  })

  it('no FR value is empty or undefined', () => {
    const t = commonStrings('fr')
    for (const [k, v] of Object.entries(t)) {
      expect(v, `Empty FR value for key ${k}`).toBeTruthy()
      expect(typeof v).toBe('string')
    }
  })

  it('no EN value is empty or undefined', () => {
    const t = commonStrings('en')
    for (const [k, v] of Object.entries(t)) {
      expect(v, `Empty EN value for key ${k}`).toBeTruthy()
      expect(typeof v).toBe('string')
    }
  })
})

describe('dateLocale', () => {
  it('maps fr → fr-FR, en → en-GB', () => {
    expect(dateLocale('fr')).toBe('fr-FR')
    expect(dateLocale('en')).toBe('en-GB')
  })
})

describe('distributorStatusLabel', () => {
  it.each([
    ['fr', 'online', 'en ligne'],
    ['fr', 'offline', 'hors ligne'],
    ['fr', 'maintenance', 'maintenance'],
    ['fr', 'decommissioned', 'désactivé'],
    ['en', 'online', 'online'],
    ['en', 'offline', 'offline'],
    ['en', 'maintenance', 'maintenance'],
    ['en', 'decommissioned', 'decommissioned'],
  ] as const)('lang=%s, status=%s → %s', (lang, status, expected) => {
    expect(distributorStatusLabel(lang, status)).toBe(expected)
  })
})

describe('fmtRelative', () => {
  it('returns — for null', () => {
    expect(fmtRelative('fr', null)).toBe('—')
    expect(fmtRelative('en', null)).toBe('—')
  })

  it('FR formats seconds, minutes, hours, days', () => {
    const now = Date.now()
    expect(fmtRelative('fr', new Date(now - 30_000).toISOString())).toBe('il y a 30s')
    expect(fmtRelative('fr', new Date(now - 5 * 60_000).toISOString())).toBe('il y a 5min')
    expect(fmtRelative('fr', new Date(now - 3 * 3600_000).toISOString())).toBe('il y a 3h')
    expect(fmtRelative('fr', new Date(now - 2 * 86_400_000).toISOString())).toBe('il y a 2j')
  })

  it('EN formats seconds, minutes, hours, days', () => {
    const now = Date.now()
    expect(fmtRelative('en', new Date(now - 30_000).toISOString())).toBe('30s ago')
    expect(fmtRelative('en', new Date(now - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(fmtRelative('en', new Date(now - 3 * 3600_000).toISOString())).toBe('3h ago')
    expect(fmtRelative('en', new Date(now - 2 * 86_400_000).toISOString())).toBe('2d ago')
  })
})

describe('fmtDateShort / fmtDateTime', () => {
  it('returns — for null', () => {
    expect(fmtDateShort('fr', null)).toBe('—')
    expect(fmtDateTime('fr', null)).toBe('—')
  })

  it('FR uses fr-FR locale (dd/mm/yyyy)', () => {
    const iso = '2026-05-21T14:30:00Z'
    const short = fmtDateShort('fr', iso)
    // fr-FR : 21/05/2026 — accepter aussi le format avec ou sans padding selon node
    expect(short).toMatch(/21\/05\/2026/)
  })

  it('EN uses en-GB locale (dd/mm/yyyy)', () => {
    const iso = '2026-05-21T14:30:00Z'
    const short = fmtDateShort('en', iso)
    // en-GB est aussi dd/mm/yyyy
    expect(short).toMatch(/21\/05\/2026/)
  })

  it('fmtDateTime includes time HH:MM', () => {
    const iso = '2026-05-21T14:30:00Z'
    const dt = fmtDateTime('fr', iso)
    // TZ-agnostic : on vérifie juste qu'on a un HH:MM quelque part
    expect(dt).toMatch(/\d{2}:\d{2}/)
    expect(dt).toMatch(/21\/05/)
  })
})

describe('fmtToday', () => {
  it('returns a non-empty localized string for fr', () => {
    const v = fmtToday('fr')
    expect(v).toBeTruthy()
    expect(typeof v).toBe('string')
    // Forme attendue : "lundi 21 mai" — au moins un jour de la semaine
    expect(v.length).toBeGreaterThan(5)
  })

  it('returns a non-empty localized string for en', () => {
    const v = fmtToday('en')
    expect(v).toBeTruthy()
    expect(typeof v).toBe('string')
    expect(v.length).toBeGreaterThan(5)
  })
})
