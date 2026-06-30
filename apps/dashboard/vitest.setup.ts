/**
 * Setup global vitest pour le dashboard.
 *
 * Étend `expect` avec les matchers @testing-library/jest-dom
 * (`toBeInTheDocument`, `toHaveClass`, `toHaveAttribute`, etc.).
 *
 * happy-dom n'expose pas `localStorage` par défaut → on installe un shim
 * minimal au cas où certains tests le requièrent (ThemeProvider, etc.).
 */
import '@testing-library/jest-dom/vitest'

// Shim localStorage pour happy-dom (Map-backed, suffisant pour nos tests).
// Idempotent : si une future version de happy-dom l'expose nativement, on
// laisse l'implémentation en place.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}
