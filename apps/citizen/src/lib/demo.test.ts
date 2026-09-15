import { beforeEach, describe, expect, it } from 'vitest'
import { demoApi } from './demo'
import { ApiError } from './contract'

/**
 * Le mode démo sert en rendez-vous client : s'il se bloque au milieu du
 * parcours, la démonstration s'arrête. D'où ces tests sur le scénario complet.
 */
describe('mode démo', () => {
  beforeEach(async () => {
    // L'état est un module singleton : on repart d'un emprunt rendu.
    try {
      await demoApi.returnLoan('demo-loan')
    } catch {
      /* déjà rendu */
    }
  })

  it('refuse un séjour inconnu', async () => {
    await expect(demoApi.identify('SL-001', '999', 'Dupont')).rejects.toBeInstanceOf(ApiError)
  })

  it('déroule emprunt puis retour', async () => {
    const identity = await demoApi.identify('SL-001', '214', 'martin')
    expect(identity.activeLoan).toBeNull()

    const loan = await demoApi.borrow('SL-001', identity.stayId, 'foot')
    expect(loan.lockerNumber).toBeGreaterThan(0)

    const after = await demoApi.identify('SL-001', '214', 'Martin')
    expect(after.activeLoan?.id).toBe(loan.id)

    const result = await demoApi.returnLoan(loan.id)
    expect(result.lockerNumber).toBeGreaterThan(0)
  })

  it('interdit deux emprunts simultanés', async () => {
    const identity = await demoApi.identify('SL-001', '214', 'martin')
    await demoApi.borrow('SL-001', identity.stayId, 'foot')
    await expect(demoApi.borrow('SL-001', identity.stayId, 'basket')).rejects.toMatchObject({
      code: 'loan_already_active',
    })
  })

  it('grise un article dont il ne reste rien', async () => {
    const kiosk = await demoApi.getKiosk('SL-001')
    expect(kiosk.items.some((item) => item.available === 0)).toBe(true)
  })
})
