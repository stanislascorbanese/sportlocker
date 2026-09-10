import { describe, expect, it } from 'vitest'
import { de } from './de'
import { en } from './en'
import { fr } from './fr'
import { nl } from './nl'
import { LANGS, type Copy, type Lang } from './types'

/**
 * Ce que TypeScript ne peut pas vérifier.
 *
 * Le typage contre `Copy` garantit qu'aucune clé ne manque. Il ne garantit pas
 * qu'on a bien traduit : recopier la phrase française dans `de.ts` compile
 * parfaitement, et ne se voit que sur la borne, par un vacancier allemand qui
 * repart à l'accueil. C'est ce trou-là que ce fichier bouche.
 */

const DICTS: Record<Lang, Copy> = { fr, en, nl, de }

/** Arguments représentatifs, pour mesurer ce qui s'affiche vraiment. */
const SAMPLE: Record<string, unknown[]> = {
  greeting: ['Martin'],
  stock: [6],
  available: [3],
  where: ['SL-DUNES-01', 4],
}

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof value === 'string') {
    out[prefix] = value
    return out
  }
  if (typeof value === 'function') {
    const key = prefix.split('.').pop() ?? ''
    out[prefix] = String((value as (...a: unknown[]) => string)(...(SAMPLE[key] ?? ['x'])))
    return out
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out)
    }
  }
  return out
}

const FLAT = Object.fromEntries(
  LANGS.map((lang) => [lang, flatten(DICTS[lang])]),
) as Record<Lang, Record<string, string>>

/**
 * La seule chaîne qui s'écrit pareil dans les quatre langues : « Frisbee » est
 * une marque déposée passée dans l'usage courant partout.
 *
 * La liste est tenue courte exprès. Chaque entrée est un endroit où le test ne
 * regarde plus, donc où un oubli de traduction passera sans bruit — on n'en
 * ajoute une qu'après avoir vérifié que le mot est bien identique, et pas
 * seulement oublié.
 */
const HOMOGRAPHES = new Set(['items.disque'])

describe('dictionnaires', () => {
  it('couvrent exactement les mêmes clés', () => {
    const reference = Object.keys(FLAT.fr).sort()
    for (const lang of LANGS) {
      expect(Object.keys(FLAT[lang]).sort(), `langue ${lang}`).toEqual(reference)
    }
  })

  it.each(LANGS.filter((l) => l !== 'fr'))('%s ne recopie pas le français', (lang) => {
    const copies = Object.keys(FLAT.fr).filter(
      (key) =>
        !HOMOGRAPHES.has(key) &&
        FLAT.fr[key]!.length > 4 &&
        FLAT[lang][key] === FLAT.fr[key],
    )
    expect(copies, `chaînes restées en français en ${lang}`).toEqual([])
  })

  it('ne laisse aucune chaîne vide', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(FLAT[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('')
      }
    }
  })

  it('garde les libellés de boutons assez courts pour tenir sur une ligne', () => {
    // Le bouton fait 408 px de large au maximum (max-w-md moins les marges) et
    // le texte 17 px : au-delà d'une quarantaine de caractères il passe à la
    // ligne, ce qui casse la hauteur de cible de 64 px.
    const BOUTONS = /submit$|cta$|retry$|done$|giveBack$|seeLoan$|noneCta$/
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(FLAT[lang])) {
        if (BOUTONS.test(key)) expect(value.length, `${lang}.${key}`).toBeLessThanOrEqual(40)
      }
    }
  })
})
