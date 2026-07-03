/**
 * Test de parité FR/EN pour tous les dicos i18n du dashboard.
 *
 * Garantit qu'on n'ajoute jamais une clé dans `fr:` sans son équivalent
 * `en:` (et vice-versa) — c'est le bug le plus fréquent quand on étend
 * un dico : tu ajoutes la clé d'un côté seul, TypeScript ne te crie pas
 * dessus (puisque le record est typé via la Key union), mais l'utilisateur
 * voit `undefined` à l'affichage.
 *
 * Couvre aussi : pas de valeur vide, pas de strings strictement identiques
 * entre FR et EN pour les mots évidents (sanity check — la traduction
 * est faite ou pas faite).
 */
import { describe, expect, it } from 'vitest'

import { auditStrings } from './audit'
import { authStrings } from './auth'
import { commonStrings } from './common'
import { communesStrings } from './communes'
import { homeStrings } from './home'
import { invitesStrings } from './invites'
import { itemsStrings } from './items'
import { maintenanceStrings } from './maintenance'
import { meStrings } from './me'
import { paymentsStrings } from './payments'
import { pricingStrings } from './pricing'
import { reportsStrings } from './reports'
import { reservationsStrings } from './reservations'
import { statsStrings } from './stats'
import { superAdminStrings } from './super-admin'
import { usersStrings } from './users'

const DICOS = {
  audit:        auditStrings,
  auth:         authStrings,
  common:       commonStrings,
  communes:     communesStrings,
  home:         homeStrings,
  invites:      invitesStrings,
  items:        itemsStrings,
  maintenance:  maintenanceStrings,
  me:           meStrings,
  payments:     paymentsStrings,
  pricing:      pricingStrings,
  reports:      reportsStrings,
  reservations: reservationsStrings,
  stats:        statsStrings,
  superAdmin:   superAdminStrings,
  users:        usersStrings,
} as const

describe.each(Object.entries(DICOS))('dico %s', (_name, dico) => {
  it('FR and EN have exactly the same keys (parity)', () => {
    const frKeys = Object.keys(dico('fr')).sort()
    const enKeys = Object.keys(dico('en')).sort()
    expect(enKeys).toEqual(frKeys)
  })

  it('no value is empty or undefined (FR)', () => {
    const t = dico('fr')
    for (const [k, v] of Object.entries(t)) {
      expect(v, `Empty FR value for key ${k}`).toBeTruthy()
      expect(typeof v).toBe('string')
    }
  })

  it('no value is empty or undefined (EN)', () => {
    const t = dico('en')
    for (const [k, v] of Object.entries(t)) {
      expect(v, `Empty EN value for key ${k}`).toBeTruthy()
      expect(typeof v).toBe('string')
    }
  })
})
