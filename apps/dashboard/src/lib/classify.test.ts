import { describe, expect, it } from 'vitest'

import type { StripeConnectStatus } from './api'
import {
  classifyContract,
  classifySeverity,
  classifyStripeConnect,
  classifyTrustScore,
  CONTRACT_EXPIRING_WINDOW_MS,
} from './classify'

function stripe(
  partial: Partial<StripeConnectStatus> = {},
): StripeConnectStatus {
  return {
    connected: true,
    accountId: 'acct_test',
    chargesEnabled: false,
    payoutsEnabled: false,
    onboardedAt: null,
    ...partial,
  }
}

describe('classifyStripeConnect', () => {
  it('not_started si pas connecté', () => {
    expect(classifyStripeConnect(stripe({ connected: false }))).toBe('not_started')
  })

  it('fully_verified si les 2 flags green', () => {
    expect(classifyStripeConnect(stripe({ chargesEnabled: true, payoutsEnabled: true })))
      .toBe('fully_verified')
  })

  it('charges_only si charges OK mais pas payouts (AML pause)', () => {
    expect(classifyStripeConnect(stripe({ chargesEnabled: true, payoutsEnabled: false })))
      .toBe('charges_only')
  })

  it('payouts_only si payouts OK mais pas charges (cas rare)', () => {
    expect(classifyStripeConnect(stripe({ chargesEnabled: false, payoutsEnabled: true })))
      .toBe('payouts_only')
  })

  it('pending_verification si connecté mais aucun flag green', () => {
    expect(classifyStripeConnect(stripe({ chargesEnabled: false, payoutsEnabled: false })))
      .toBe('pending_verification')
  })
})

describe('classifyContract', () => {
  const NOW = 1_700_000_000_000  // 2023-11-14T22:13:20Z (référence fixe)

  it('none si contractEnd null', () => {
    expect(classifyContract(null, NOW)).toBe('none')
  })

  it('expired si contractEnd dans le passé', () => {
    expect(classifyContract('2020-01-01T00:00:00Z', NOW)).toBe('expired')
  })

  it('expiring_soon si fin dans < 60 jours', () => {
    const inOneMonth = new Date(NOW + 30 * 24 * 3600 * 1000).toISOString()
    expect(classifyContract(inOneMonth, NOW)).toBe('expiring_soon')
  })

  it('active si fin > 60 jours dans le futur', () => {
    const inSixMonths = new Date(NOW + 180 * 24 * 3600 * 1000).toISOString()
    expect(classifyContract(inSixMonths, NOW)).toBe('active')
  })

  it('expired si exactement maintenant (endMs == now → strictement inférieur false, mais inférieur à window true)', () => {
    // endMs === now → endMs < now est false, donc on tombe dans expiring_soon
    // (endMs - now === 0 < window). C'est le comportement attendu : un contrat
    // qui se termine pile maintenant n'est pas "expired", il "se termine".
    const justNow = new Date(NOW).toISOString()
    expect(classifyContract(justNow, NOW)).toBe('expiring_soon')
  })

  it('frontière 60 jours pile : expiring_soon (strictement inférieur à window)', () => {
    // 60 jours - 1 seconde → expiring_soon
    const justUnder60d = new Date(NOW + CONTRACT_EXPIRING_WINDOW_MS - 1000).toISOString()
    expect(classifyContract(justUnder60d, NOW)).toBe('expiring_soon')
    // 60 jours exact → active (strictement inférieur false)
    const exactly60d = new Date(NOW + CONTRACT_EXPIRING_WINDOW_MS).toISOString()
    expect(classifyContract(exactly60d, NOW)).toBe('active')
  })

  it('utilise Date.now() par défaut', () => {
    // Date très loin dans le futur → forcément active.
    const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
    expect(classifyContract(farFuture)).toBe('active')
  })
})

describe('classifyTrustScore', () => {
  it('high pour 90 et plus', () => {
    expect(classifyTrustScore(90)).toBe('high')
    expect(classifyTrustScore(100)).toBe('high')
  })

  it('medium pour 60-89', () => {
    expect(classifyTrustScore(60)).toBe('medium')
    expect(classifyTrustScore(75)).toBe('medium')
    expect(classifyTrustScore(89)).toBe('medium')
  })

  it('low en dessous de 60', () => {
    expect(classifyTrustScore(59)).toBe('low')
    expect(classifyTrustScore(0)).toBe('low')
    expect(classifyTrustScore(-10)).toBe('low')  // score négatif → forcément low
  })
})

describe('classifySeverity', () => {
  it('info pour severity 1 ou moins', () => {
    expect(classifySeverity(0)).toBe('info')
    expect(classifySeverity(1)).toBe('info')
  })

  it('good pour severity 2', () => {
    expect(classifySeverity(2)).toBe('good')
  })

  it('warn pour severity 3', () => {
    expect(classifySeverity(3)).toBe('warn')
  })

  it('bad pour severity 4', () => {
    expect(classifySeverity(4)).toBe('bad')
  })

  it('critical pour severity 5 et plus', () => {
    expect(classifySeverity(5)).toBe('critical')
    expect(classifySeverity(10)).toBe('critical')
  })
})
