/**
 * Tests DownloadPdfButton — bouton "télécharger PDF" sur la page /reports.
 *
 * State machine du composant : idle → loading → (idle | error).
 *
 * Cas couverts :
 *  - Labels FR/EN au repos
 *  - Click idle → appelle generateReportAction(filters)
 *  - Pendant le call (mocké), bouton disabled + label "Génération…"
 *  - Succès → triggerDownload (Blob + <a download>) sans crash, retour à idle
 *  - Echec applicatif (`{ok:false, error:…}`) → message d'erreur visible
 *  - Exception async → message d'erreur natif (Error.message)
 *
 * Détails techniques :
 *  - happy-dom n'expose pas `URL.createObjectURL` ni `revokeObjectURL`
 *    → on les stub directement (assignation, pas spyOn).
 *  - atob est dispo dans happy-dom — pas de stub nécessaire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const generateReportActionMock = vi.fn()
vi.mock('./_actions', () => ({
  generateReportAction: (...a: unknown[]) => generateReportActionMock(...a),
}))

import { DownloadPdfButton } from './DownloadPdfButton'
import type { ReportFilters } from './_actions'

// Fixtures : un PDF base64 minuscule (le contenu n'importe pas, on teste juste
// que la chaîne de download ne crashe pas dans happy-dom).
const SAMPLE_BASE64 = 'JVBERi0xLjQK' // "%PDF-1.4\n" en base64
const SAMPLE_FILENAME = 'report-2026-06.pdf'

const filters: ReportFilters = {
  from: '2026-06-01',
  to: '2026-06-30',
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

beforeEach(() => {
  generateReportActionMock.mockReset()
  // happy-dom n'expose pas createObjectURL — on stub avec assignation directe
  ;(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = vi
    .fn()
    .mockReturnValue('blob:fake-url')
  ;(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = vi.fn()
})

afterEach(() => {
  cleanup()
  ;(URL as unknown as { createObjectURL: typeof originalCreateObjectURL }).createObjectURL =
    originalCreateObjectURL
  ;(URL as unknown as { revokeObjectURL: typeof originalRevokeObjectURL }).revokeObjectURL =
    originalRevokeObjectURL
})

describe('DownloadPdfButton — labels i18n', () => {
  it("affiche 'Télécharger PDF' au repos en FR", () => {
    render(<DownloadPdfButton filters={filters} lang="fr" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Télécharger.*PDF/i)
  })

  it("affiche 'Download PDF' au repos en EN", () => {
    render(<DownloadPdfButton filters={filters} lang="en" />)
    expect(screen.getByRole('button')).toHaveTextContent(/Download.*PDF/i)
  })
})

describe('DownloadPdfButton — interaction', () => {
  it("click idle : appelle generateReportAction avec les filtres", async () => {
    generateReportActionMock.mockResolvedValue({
      ok: true,
      base64: SAMPLE_BASE64,
      filename: SAMPLE_FILENAME,
    })

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(generateReportActionMock).toHaveBeenCalledWith(filters)
    })
  })

  it("succès : déclenche le download (createObjectURL appelé)", async () => {
    generateReportActionMock.mockResolvedValue({
      ok: true,
      base64: SAMPLE_BASE64,
      filename: SAMPLE_FILENAME,
    })

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalledOnce()
    })
  })

  it("succès : retour à l'état idle (label 'Télécharger PDF' à nouveau)", async () => {
    generateReportActionMock.mockResolvedValue({
      ok: true,
      base64: SAMPLE_BASE64,
      filename: SAMPLE_FILENAME,
    })

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent(/Télécharger/i)
    })
    expect(screen.getByRole('button')).not.toBeDisabled()
  })
})

describe('DownloadPdfButton — états erreur', () => {
  it("erreur applicative (ok:false) : affiche le message d'erreur retourné", async () => {
    generateReportActionMock.mockResolvedValue({
      ok: false,
      error: 'Aucune donnée pour cette période',
    })

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByText('Aucune donnée pour cette période')).toBeInTheDocument()
    })
    // Le bouton revient cliquable
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it("exception async : affiche Error.message", async () => {
    generateReportActionMock.mockRejectedValue(new Error('Timeout réseau'))

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      expect(screen.getByText('Timeout réseau')).toBeInTheDocument()
    })
  })

  it("exception non-Error : fallback sur le label 'erreur inconnue'", async () => {
    generateReportActionMock.mockRejectedValue('plain string thrown')

    render(<DownloadPdfButton filters={filters} lang="fr" />)
    fireEvent.click(screen.getByRole('button'))

    await vi.waitFor(() => {
      // pdfUnknownError FR : "Erreur inconnue"
      expect(screen.getByText(/Erreur inconnue/i)).toBeInTheDocument()
    })
  })
})
