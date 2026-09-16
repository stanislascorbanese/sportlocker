/**
 * Setup global vitest pour l'app vacancier.
 *
 * Étend `expect` avec les matchers @testing-library/jest-dom, et remet l'état
 * à zéro entre chaque test.
 *
 * Le shim `localStorage` n'est pas une precaution decorative. Sous Node 22 et
 * au-dela, Node expose son propre `localStorage` experimental, desactive tant
 * qu'on ne passe pas `--localstorage-file`. Cette globale prend le pas sur
 * celle de happy-dom, et `window.localStorage` se retrouve `undefined` : le
 * `afterEach` ci-dessous levait alors, ce qui faisait echouer les 14 tests de
 * l'app — y compris ceux qui ne touchent jamais au stockage.
 *
 * La CI tourne sous Node 20 et ne voyait donc rien. Le symptome n'apparaissait
 * que sur les machines de developpement recentes.
 *
 * Le dashboard a rencontre le meme mur et pose le meme shim (voir
 * apps/dashboard/vitest.setup.ts) : on reprend son implementation plutot que
 * d'en inventer une seconde.
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

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

afterEach(() => {
  globalThis.localStorage.clear()
  document.documentElement.className = ''
})
