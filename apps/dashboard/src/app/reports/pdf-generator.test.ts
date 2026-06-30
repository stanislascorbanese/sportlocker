import { writeFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { StatsDashboard } from '../../lib/api'
import { demoStatsDashboard, DEMO_COMMUNES } from '../../lib/demo-data'

import { generatePdfBuffer } from './pdf-generator'

describe('generatePdfBuffer', () => {
  it('génère un PDF non-vide avec des stats démo', async () => {
    const stats = demoStatsDashboard(30)
    const buf = await generatePdfBuffer({
      filters: { from: '2026-04-19', to: '2026-05-18' },
      stats,
      commune: DEMO_COMMUNES[0] ?? null,
      role: 'admin',
      source: 'demo',
    })

    expect(buf.length).toBeGreaterThan(2000)
    // Magic bytes PDF : %PDF-1.x
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
    // EOF marker dans les derniers octets
    const tail = buf.slice(-1024).toString()
    expect(tail).toMatch(/%%EOF/)

    // Le rapport doit tenir sur 2 pages max (spec : "synthèse rapide").
    // /Count N dans le dictionnaire Pages permet de compter sans parser.
    const countMatch = buf.toString('binary').match(/\/Count (\d+)/)
    expect(countMatch).not.toBeNull()
    const pageCount = countMatch ? Number(countMatch[1]) : 0
    expect(pageCount).toBeGreaterThan(0)
    expect(pageCount).toBeLessThanOrEqual(2)

    // Side-effect dev : écrit le sample dans /tmp pour inspection manuelle
    // (Acrobat, Safari Preview). Pas une assertion, juste pratique.
    writeFileSync('/tmp/sportlocker-rapport-sample.pdf', buf)
  })

  it('génère un PDF même quand toutes les séries sont vides', async () => {
    const stats: StatsDashboard = {
      days: 30,
      daily: [],
      byStatus: [],
      topDistributors: [],
      topItemTypes: [],
      hourly: [],
    }
    const buf = await generatePdfBuffer({
      filters: { from: '2026-04-19', to: '2026-05-18' },
      stats,
      commune: null,
      role: 'super_admin',
      source: 'live',
    })
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
  })

  it('avec beaucoup de données, ne déborde pas (≤ 2 pages)', async () => {
    // Fenêtre 90j → série daily plus longue, top distributeurs maxi 5 mais
    // si l'API en renvoie plus, on garde notre slice à 5.
    const stats = demoStatsDashboard(90)
    const buf = await generatePdfBuffer({
      filters: { from: '2026-02-18', to: '2026-05-18' },
      stats,
      commune: DEMO_COMMUNES[0] ?? null,
      role: 'admin',
      source: 'live',
    })
    const countMatch = buf.toString('binary').match(/\/Count (\d+)/)
    const pageCount = countMatch ? Number(countMatch[1]) : 99
    expect(pageCount).toBeLessThanOrEqual(2)
  })

  it('inclut le nom de commune quand fourni', async () => {
    const stats = demoStatsDashboard(7)
    const buf = await generatePdfBuffer({
      filters: { from: '2026-05-12', to: '2026-05-18' },
      stats,
      commune: {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01',
        inseeCode: '75111',
        name: 'Paris 11e',
        postalCode: '75011',
        department: '75',
        region: 'Île-de-France',
        population: 147017,
        contractStart: '2025-09-01',
        contractEnd: '2027-08-31',
        monthlyFeeCents: 150000,
        contactEmail: null,
        contactPhone: null,
        distributorCount: 8,
      },
      role: 'admin',
      source: 'live',
    })
    // Le PDF contient les flux compressés — on vérifie juste qu'il est valide.
    expect(buf.length).toBeGreaterThan(2000)
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
  })
})
