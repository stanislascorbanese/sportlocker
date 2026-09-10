import type { ItemKind } from '@sportlocker/types'

/**
 * Pictogramme d'un article, et comparaison de nom de famille.
 *
 * Les deux servent au parcours vacancier et aux écrans d'exploitation, d'où ce
 * module plutôt qu'un import d'une route vers une autre.
 */

/**
 * Déduit le pictogramme d'un type d'article. On regarde le slug puis le nom,
 * parce qu'un catalogue rempli par un camping contient autant « ballon-foot »
 * que « Ballon de football ».
 */
export function kindOf(slug: string, name: string): ItemKind {
  const h = `${slug} ${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/basket/.test(h)) return 'basket'
  if (/volley/.test(h)) return 'volley'
  if (/raquette|badminton|tennis|ping/.test(h)) return 'raquette'
  if (/frisbee|disque/.test(h)) return 'disque'
  if (/plot|cone|plots/.test(h)) return 'plot'
  if (/corde/.test(h)) return 'corde'
  if (/boule|petanque|molkky|molky/.test(h)) return 'boule'
  if (/ballon|football|foot|hand|rugby/.test(h)) return 'ballon'
  return 'autre'
}

/**
 * Comparaison de nom de famille : insensible à la casse, aux accents, aux
 * espaces et aux traits d'union. « de la Fontaine », « DE LA FONTAINE » et
 * « delafontaine » doivent passer — un vacancier qui tape son propre nom sur
 * un téléphone au soleil ne doit pas être renvoyé pour une apostrophe.
 */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s'\u2019-]/g, '')
}
