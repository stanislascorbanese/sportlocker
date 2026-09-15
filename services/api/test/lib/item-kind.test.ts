/**
 * Le pictogramme déduit du catalogue de l'exploitant.
 *
 * Ce module a l'air anodin et ne l'est pas : hors du français, l'app vacancier
 * n'affiche PAS le libellé saisi par le camping — elle affiche le mot générique
 * du `kind`. Une déduction trop grossière ne donne donc pas un mauvais dessin,
 * elle donne un mauvais NOM. Tant que ping-pong, badminton et raquettes de
 * plage retombaient tous sur `raquette`, un vacancier néerlandais voyait trois
 * tuiles identiques intitulées « Racket ».
 *
 * D'où ces tests, et d'où leur insistance sur l'ORDRE des règles.
 */
import { describe, expect, it } from 'vitest'

import { kindOf } from '../../src/lib/item-kind.js'

describe('kindOf', () => {
  it('distingue les trois familles de raquettes', () => {
    expect(kindOf('raquettes-ping-pong', 'Raquettes de ping-pong')).toBe('pingpong')
    expect(kindOf('set-badminton', 'Set de badminton')).toBe('badminton')
    expect(kindOf('raquette-tennis', 'Raquette de tennis')).toBe('tennis')
  })

  /**
   * Le cas qui justifie l'ordre des règles. « Raquette de badminton » contient
   * les deux mots ; si `raquette` était testé en premier, le sport serait perdu
   * et on retomberait sur le générique.
   */
  it('le sport l\'emporte sur le mot « raquette »', () => {
    expect(kindOf('', 'Raquette de badminton')).toBe('badminton')
    expect(kindOf('', 'Raquettes de tennis de table')).toBe('pingpong')
  })

  it('garde « raquette » pour ce qu\'on ne sait pas nommer', () => {
    expect(kindOf('raquettes-plage', 'Raquettes de plage')).toBe('raquette')
  })

  it('ne confond pas les trois ballons', () => {
    expect(kindOf('ballon-foot', 'Ballon de football')).toBe('ballon')
    expect(kindOf('ballon-basket', 'Ballon de basket')).toBe('basket')
    expect(kindOf('ballon-volley', 'Ballon de volley')).toBe('volley')
  })

  it('lit le slug comme le nom, accents compris', () => {
    // Un catalogue rempli à la main contient autant « petanque » que « Pétanque ».
    expect(kindOf('petanque', '')).toBe('boule')
    expect(kindOf('', 'Jeu de pétanque')).toBe('boule')
  })

  it('retombe sur « autre » plutôt que de refuser un article inconnu', () => {
    // Un type inconnu doit rester empruntable : il perd son dessin, pas sa place.
    expect(kindOf('kubb', 'Jeu de Kubb')).toBe('autre')
  })
})
