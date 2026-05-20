'use client'

import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { generateReportAction, type ReportFilters } from './_actions'

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }

/**
 * Bouton "Télécharger PDF" — invoque la Server Action `generateReportAction`,
 * décode la base64 reçue en Blob, force le téléchargement côté navigateur.
 *
 * On garde l'erreur en local pour pouvoir l'afficher discrètement sans
 * casser le reste de la page.
 */
export function DownloadPdfButton({ filters }: { filters: ReportFilters }) {
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function onClick() {
    setState({ kind: 'loading' })
    try {
      const res = await generateReportAction(filters)
      if (!res.ok) {
        setState({ kind: 'error', message: res.error })
        return
      }
      triggerDownload(res.base64, res.filename)
      setState({ kind: 'idle' })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Erreur inconnue',
      })
    }
  }

  const busy = state.kind === 'loading'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 transition hover:border-emerald-400/60 hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {busy ? 'Génération…' : 'Télécharger PDF'}
      </button>
      {state.kind === 'error' && (
        <p className="max-w-[280px] text-right text-[11px] text-rose-300">
          {state.message}
        </p>
      )}
    </div>
  )
}

function triggerDownload(base64: string, filename: string): void {
  // base64 → Uint8Array → Blob (PDF) → ObjectURL → click sur <a download>
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke après un petit délai pour laisser le navigateur initier le download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
