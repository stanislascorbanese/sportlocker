import { describe, expect, it } from 'vitest'

import { DEFAULT_LANG, LANG_COOKIE, LANG_LABELS, SUPPORTED_LANGS, isLang } from './lang'

describe('lang', () => {
  describe('SUPPORTED_LANGS', () => {
    it('contient fr et en', () => {
      expect(SUPPORTED_LANGS).toEqual(['fr', 'en'])
    })

    it('DEFAULT_LANG est fr', () => {
      expect(DEFAULT_LANG).toBe('fr')
    })

    it('LANG_COOKIE est sportlocker-lang', () => {
      expect(LANG_COOKIE).toBe('sportlocker-lang')
    })
  })

  describe('isLang', () => {
    it('renvoie true pour fr', () => {
      expect(isLang('fr')).toBe(true)
    })

    it('renvoie true pour en', () => {
      expect(isLang('en')).toBe(true)
    })

    it('renvoie false pour une langue non supportée', () => {
      expect(isLang('es')).toBe(false)
      expect(isLang('de')).toBe(false)
    })

    it('renvoie false pour des valeurs non-string', () => {
      expect(isLang(null)).toBe(false)
      expect(isLang(undefined)).toBe(false)
      expect(isLang(42)).toBe(false)
      expect(isLang({})).toBe(false)
      expect(isLang(['fr'])).toBe(false)
    })

    it('renvoie false pour une chaîne vide', () => {
      expect(isLang('')).toBe(false)
    })

    it('est sensible à la casse (fr ≠ FR)', () => {
      expect(isLang('FR')).toBe(false)
      expect(isLang('En')).toBe(false)
    })
  })

  describe('LANG_LABELS', () => {
    it('expose un label natif et un drapeau pour chaque langue supportée', () => {
      for (const lang of SUPPORTED_LANGS) {
        expect(LANG_LABELS[lang]).toBeDefined()
        expect(LANG_LABELS[lang].native).toBeTruthy()
        expect(LANG_LABELS[lang].flag).toBeTruthy()
      }
    })
  })
})
