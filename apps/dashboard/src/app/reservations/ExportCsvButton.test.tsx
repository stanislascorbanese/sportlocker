/**
 * Tests ExportCsvButton — export CSV des réservations filtrées.
 *
 * Couvre :
 *  - Rendu : label idle/pending FR vs EN
 *  - Click : appelle exportReservationsCsvAction(filters)
 *  - Succès : crée un Blob CSV + déclenche le download via <a> click
 *  - Source=demo : 2e alert "données fictives" différé
 *  - Échec : alert l'erreur, pas de download
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const exportReservationsCsvActionMock = vi.fn()
vi.mock('./_actions', () => ({
  exportReservationsCsvAction: async (...a: unknown[]) => exportReservationsCsvActionMock(...a),
}))

vi.mock('../../lib/lang-client', () => ({
  useLang: () => 'fr',
}))

import { ExportCsvButton } from './ExportCsvButton'

const filters = {} as Parameters<typeof ExportCsvButton>[0]['filters']

beforeEach(() => {
  exportReservationsCsvActionMock.mockReset().mockResolvedValue({
    ok: true,
    csv: 'created,status\n2026-01-01,active',
    filename: 'reservations.csv',
    source: 'live' as const,
  })
})

afterEach(cleanup)

describe('ExportCsvButton', () => {
  it("affiche 'Exporter CSV' au repos", () => {
    render(<ExportCsvButton filters={filters} />)
    expect(screen.getByRole('button')).toHaveTextContent(/Exporter CSV/i)
  })

  it("click appelle exportReservationsCsvAction avec les filters", async () => {
    render(<ExportCsvButton filters={filters} />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(exportReservationsCsvActionMock).toHaveBeenCalledWith(filters)
    })
  })

  it("succès : crée un object URL et clique sur un <a download>", async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:fake-url')
    const revokeObjectURLMock = vi.fn()
    // happy-dom n'a pas URL.createObjectURL par défaut
    ;(URL as unknown as { createObjectURL: typeof createObjectURLMock }).createObjectURL = createObjectURLMock
    ;(URL as unknown as { revokeObjectURL: typeof revokeObjectURLMock }).revokeObjectURL = revokeObjectURLMock

    render(<ExportCsvButton filters={filters} />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(createObjectURLMock).toHaveBeenCalled()
    })
  })

  it("source=demo : alert 'données fictives' après le download", async () => {
    exportReservationsCsvActionMock.mockResolvedValueOnce({
      ok: true,
      csv: 'demo',
      filename: 'reservations-demo.csv',
      source: 'demo',
    })
    const alertSpy = vi.fn()
    window.alert = alertSpy
    ;(URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x'
    ;(URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {}

    render(<ExportCsvButton filters={filters} />)
    fireEvent.click(screen.getByRole('button'))

    // Le toast démo est différé de 100ms via setTimeout
    await new Promise((r) => setTimeout(r, 200))
    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/démo/i))
  })

  it("échec : alert l'erreur, pas de download", async () => {
    exportReservationsCsvActionMock.mockResolvedValueOnce({ ok: false, error: 'no_admin' })
    const alertSpy = vi.fn()
    window.alert = alertSpy
    const createObjectURLMock = vi.fn()
    ;(URL as unknown as { createObjectURL: typeof createObjectURLMock }).createObjectURL = createObjectURLMock

    render(<ExportCsvButton filters={filters} />)
    fireEvent.click(screen.getByRole('button'))
    await vi.waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('no_admin')
    })
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })
})
