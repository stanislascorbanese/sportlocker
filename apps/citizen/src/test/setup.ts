/**
 * Setup global pour tous les tests citizen.
 *
 * happy-dom@20 (env vitest par défaut) **ne fournit pas localStorage** sur
 * window — il faut le polyfill nous-mêmes pour que les Providers (theme,
 * i18n, OnboardingSheet) qui le lisent au mount ne crashent pas.
 *
 * Pareil : `navigator.language` est forcé à `fr-FR` pour que les tests soient
 * déterministes (sinon happy-dom renvoie `en-US` selon la machine de CI →
 * I18nProvider démarrerait en EN au lieu de FR par défaut).
 */
import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

/**
 * Polyfill localStorage / sessionStorage. Backed par une Map locale par
 * test (réinitialisée via cleanup() afterEach).
 */
function makeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
}

beforeEach(() => {
  if (typeof window === 'undefined') return

  // Polyfill storage si absent
  if (!window.localStorage || typeof window.localStorage.getItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      value: makeStorage(),
      writable: true,
      configurable: true,
    })
  }
  if (!window.sessionStorage || typeof window.sessionStorage.getItem !== 'function') {
    Object.defineProperty(window, 'sessionStorage', {
      value: makeStorage(),
      writable: true,
      configurable: true,
    })
  }

  // Force la langue navigateur à FR pour les tests : sinon happy-dom renvoie
  // en-US et l'I18nProvider démarrerait en EN, cassant les assertions FR.
  if (window.navigator.language !== 'fr-FR') {
    Object.defineProperty(window.navigator, 'language', {
      value: 'fr-FR',
      configurable: true,
    })
    Object.defineProperty(window.navigator, 'languages', {
      value: ['fr-FR', 'fr'],
      configurable: true,
    })
  }

  // matchMedia : happy-dom le supporte mais on stub explicitement pour
  // contrôler `prefers-color-scheme` et `prefers-reduced-motion`.
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    })
  }
})

afterEach(() => {
  // RTL n'auto-cleanup pas par défaut avec Vitest — sans ça, le DOM
  // accumule entre les tests et les requêtes `getByRole` trouvent
  // plusieurs matches.
  cleanup()

  if (typeof window !== 'undefined') {
    window.localStorage?.clear()
    window.sessionStorage?.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('lang')
  }
})
