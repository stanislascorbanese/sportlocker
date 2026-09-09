import { describe, expect, it } from 'vitest'
import { forgetLoan, forgetStay, getLoanId, getStay, saveLoanId, saveStay } from './session'

describe('mémoire locale du vacancier', () => {
  it('rend le séjour qu’on vient d’enregistrer', () => {
    saveStay({ stayRef: '214', lastName: 'Martin', serial: 'SL-001' })
    expect(getStay()).toEqual({ stayRef: '214', lastName: 'Martin', serial: 'SL-001' })
  })

  it('ne rend rien quand rien n’a été enregistré', () => {
    expect(getStay()).toBeNull()
    expect(getLoanId()).toBeNull()
  })

  it('oublie tout à la demande', () => {
    saveStay({ stayRef: '214', lastName: 'Martin', serial: 'SL-001' })
    saveLoanId('loan-1')
    forgetStay()
    forgetLoan()
    expect(getStay()).toBeNull()
    expect(getLoanId()).toBeNull()
  })

  it('ne casse pas sur une valeur illisible laissée par une ancienne version', () => {
    window.localStorage.setItem('sl-stay', '{pas du json')
    expect(getStay()).toBeNull()
  })
})
