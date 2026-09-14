'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileSpreadsheet, UploadCloud } from 'lucide-react'

import { importStaysAction, previewStaysAction } from './actions'
import type { Commune, StayImportPreview, StayImportResult } from '../../lib/api'
import { Badge, Button, Card } from '../../components/ui'
import { cn } from '../../lib/cn'
import type { Lang } from '../../lib/lang'
import { rejectReason, stayStrings } from '../../lib/i18n/stays'

const MAX_BYTES = 4 * 1024 * 1024
/** L'aperçu sert à vérifier, pas à relire le fichier : quelques lignes suffisent. */
const PREVIEW_SHOWN = 8
const REJECTED_SHOWN = 10

type Phase =
  | { step: 'idle' }
  | { step: 'reading' }
  | { step: 'preview'; csv: string; fileName: string; preview: StayImportPreview }
  | { step: 'importing'; csv: string; fileName: string; preview: StayImportPreview }
  | { step: 'done'; result: StayImportResult }

/**
 * Import d'un export PMS, en deux temps.
 *
 * Le premier temps n'écrit rien : il montre ce que le serveur a compris du
 * fichier — quelles colonnes il a reconnues, quelles lignes il écarte, combien
 * de séjours il retient. C'est le seul moment où quelqu'un peut voir qu'une
 * colonne « Départ » a été prise pour autre chose, et l'aperçu existe pour ça.
 *
 * Le fichier est lu dans le navigateur puis envoyé en texte à une server
 * action : pas de multipart, pas de jeton côté client, et le même chemin de
 * code pour l'aperçu et pour l'import.
 */
export function StayImport({
  lang,
  communes,
}: {
  lang: Lang
  /**
   * `null` pour un admin d'établissement : son jeton le cadre déjà, l'API
   * ignore le paramètre, et un menu à une entrée n'est que du bruit.
   * Une liste pour un super-admin, qui DOIT désigner sa cible — verser les
   * arrivées d'un camping dans un autre écrase des séjours sans retour.
   */
  communes: Commune[] | null
}) {
  const t = stayStrings(lang)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [communeId, setCommuneId] = useState('')

  const doitChoisir = communes !== null
  const cible = doitChoisir ? communeId : undefined

  function messageFor(code: string): string {
    switch (code) {
      case 'no_valid_row':   return t.errNoValidRow
      case 'too_many_rows':  return t.errTooManyRows
      default:               return t.errFile
    }
  }

  async function handleFile(file: File) {
    setError(null)
    // Vérifié avant de lire le fichier : inutile d'analyser un CSV qu'on ne
    // saura pas où écrire, et le message doit arriver au moment du dépôt.
    if (doitChoisir && !communeId) return setError(t.siteRequired)
    if (file.size === 0) return setError(t.errEmpty)
    if (file.size > MAX_BYTES) return setError(t.errTooBig)

    setPhase({ step: 'reading' })
    let csv: string
    try {
      csv = await file.text()
    } catch {
      setPhase({ step: 'idle' })
      return setError(t.errFile)
    }

    const res = await previewStaysAction(csv, cible)
    if (!res.ok) {
      setPhase({ step: 'idle' })
      return setError(messageFor(res.code))
    }
    setPhase({ step: 'preview', csv, fileName: file.name, preview: res.data })
  }

  async function confirm() {
    if (phase.step !== 'preview') return
    setPhase({ ...phase, step: 'importing' })
    const res = await importStaysAction(phase.csv, cible)
    if (!res.ok) {
      setPhase({ ...phase, step: 'preview' })
      return setError(messageFor(res.code))
    }
    setPhase({ step: 'done', result: res.data })
    // La liste en dessous vient du serveur : elle doit repartir la chercher.
    router.refresh()
  }

  function reset() {
    setPhase({ step: 'idle' })
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <Card variant="elevated" padding="md" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-navy-900 dark:text-white">{t.importTitle}</h2>
        <p className="text-sm text-gray-600 dark:text-white/55">{t.importHint}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {error}
        </p>
      )}

      {doitChoisir && (phase.step === 'idle' || phase.step === 'reading') && (
        <div className="space-y-1">
          <label
            htmlFor="commune-cible"
            className="text-meta font-medium uppercase tracking-wide text-gray-500 dark:text-white/45"
          >
            {t.siteLabel}
          </label>
          <select
            id="commune-cible"
            value={communeId}
            onChange={(e) => {
              setCommuneId(e.target.value)
              setError(null)
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-navy-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            <option value="">{t.sitePlaceholder}</option>
            {communes?.map((co) => (
              <option key={co.id} value={co.id}>
                {co.name}
              </option>
            ))}
          </select>
          <p className="text-meta text-gray-500 dark:text-white/45">{t.siteHint}</p>
        </div>
      )}

      {(phase.step === 'idle' || phase.step === 'reading') && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
          className={cn(
            'rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-brand-500 bg-brand-500/5' : 'border-gray-300 dark:border-white/15',
          )}
        >
          <UploadCloud
            size={28}
            aria-hidden
            className="mx-auto mb-3 text-gray-400 dark:text-white/35"
          />
          <p className="font-medium text-navy-900 dark:text-white">
            {phase.step === 'reading' ? t.analysing : t.dropLabel}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-white/45">{t.dropHint}</p>
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={phase.step === 'reading'}
              onClick={() => inputRef.current?.click()}
            >
              {t.pick}
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
            }}
          />
        </div>
      )}

      {(phase.step === 'preview' || phase.step === 'importing') && (
        <Preview
          lang={lang}
          fileName={phase.fileName}
          preview={phase.preview}
          busy={phase.step === 'importing'}
          onConfirm={confirm}
          onCancel={reset}
        />
      )}

      {phase.step === 'done' && <Done lang={lang} result={phase.result} onAgain={reset} />}
    </Card>
  )
}

function Preview({
  lang,
  fileName,
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  lang: Lang
  fileName: string
  preview: StayImportPreview
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = stayStrings(lang)
  const shown = preview.rows.slice(0, PREVIEW_SHOWN)
  const hidden = preview.totalRows - shown.length
  const matched = Object.entries(preview.mapping)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <FileSpreadsheet size={18} aria-hidden className="text-gray-500 dark:text-white/45" />
        <span className="font-medium text-navy-900 dark:text-white">{fileName}</span>
        <Badge tone="info">
          {preview.totalRows} {t.previewCount}
        </Badge>
        {preview.rejected.length > 0 && (
          <Badge tone="warning">
            {preview.rejected.length} {t.doneRejected}
          </Badge>
        )}
      </div>

      {/* Ce que le serveur a compris des en-têtes. C'est la seule occasion de
          voir qu'une colonne a été prise pour une autre. */}
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-meta uppercase text-gray-500 dark:text-white/40">{t.columnsFound}</dt>
          <dd className="mt-1 space-y-0.5 text-gray-700 dark:text-white/70">
            {matched.map(([header, field]) => (
              <p key={header} className="truncate">
                <span className="font-medium text-navy-900 dark:text-white">{header}</span>
                <span className="text-gray-400 dark:text-white/35"> → {field}</span>
              </p>
            ))}
          </dd>
        </div>
        <div>
          <dt className="text-meta uppercase text-gray-500 dark:text-white/40">
            {t.columnsIgnored}
          </dt>
          <dd className="mt-1 text-gray-600 dark:text-white/55">
            {preview.ignoredColumns.length > 0 ? preview.ignoredColumns.join(', ') : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-meta uppercase text-gray-500 dark:text-white/40">{t.separator}</dt>
          <dd className="mt-1 font-mono text-gray-600 dark:text-white/55">
            {preview.separator === '\t' ? '\\t' : preview.separator}
          </dd>
        </div>
      </dl>

      <div className="overflow-x-auto rounded-card border border-gray-200 dark:border-white/10">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{t.previewTitle}</caption>
          <thead className="border-b border-gray-200 text-meta uppercase tracking-wide text-gray-500 dark:border-white/10 dark:text-white/45">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t.colRef}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.colGuest}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.colArrives}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t.colDeparts}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-white/10">
            {shown.map((row, i) => (
              <tr key={`${row.stayRef}-${row.arrivesOn}-${i}`}>
                <td className="px-3 py-2 font-semibold tabular-nums text-navy-900 dark:text-white">
                  {row.stayRef}
                </td>
                <td className="px-3 py-2 text-gray-700 dark:text-white/70">
                  {[row.firstName, row.lastName].filter(Boolean).join(' ')}
                </td>
                <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-white/55">
                  {fmtDay(row.arrivesOn, lang)}
                </td>
                <td className="px-3 py-2 tabular-nums text-gray-600 dark:text-white/55">
                  {fmtDay(row.departsOn, lang)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="text-meta text-gray-500 dark:text-white/40">
          + {hidden} {t.previewMore}
        </p>
      )}

      {preview.rejected.length > 0 && (
        <div className="rounded-card border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <p className="font-medium text-amber-900 dark:text-amber-200">{t.rejectedTitle}</p>
          <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-200/80">{t.rejectedHint}</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200/90">
            {preview.rejected.slice(0, REJECTED_SHOWN).map((row) => (
              <li key={row.line} className="truncate">
                <span className="tabular-nums">
                  {t.line} {row.line}
                </span>
                {' — '}
                {rejectReason(lang, row.reason)}
                <span className="text-amber-700/70 dark:text-amber-200/50"> · {row.raw}</span>
              </li>
            ))}
            {preview.rejected.length > REJECTED_SHOWN && (
              <li>+ {preview.rejected.length - REJECTED_SHOWN}</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onConfirm} loading={busy} disabled={busy}>
          {busy ? t.importing : t.confirm}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          {t.cancel}
        </Button>
      </div>
    </div>
  )
}

function Done({
  lang,
  result,
  onAgain,
}: {
  lang: Lang
  result: StayImportResult
  onAgain: () => void
}) {
  const t = stayStrings(lang)
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
        <CheckCircle2 size={18} aria-hidden />
        {t.doneTitle}
      </p>
      <ul className="space-y-1 text-sm text-gray-700 dark:text-white/70">
        <li>
          <span className="font-semibold tabular-nums">{result.inserted}</span> {t.doneInserted}
        </li>
        <li>
          <span className="font-semibold tabular-nums">{result.updated}</span> {t.doneUpdated}
        </li>
        {result.rejected.length > 0 && (
          <li>
            <span className="font-semibold tabular-nums">{result.rejected.length}</span>{' '}
            {t.doneRejected}
          </li>
        )}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={onAgain}>
        {t.doneAgain}
      </Button>
    </div>
  )
}

function fmtDay(iso: string, lang: Lang): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}
