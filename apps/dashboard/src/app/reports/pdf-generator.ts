// Module Node-only — instancie `pdfkit` (CommonJS) côté server. Importer ce
// module depuis un client component cassera le build (pdfkit utilise `fs`).
// Voir `_actions.ts` qui le pilote depuis une Server Action.

import PDFDocument from 'pdfkit'

import type { Commune, StatsDashboard } from '../../lib/api'

export type ReportFilters = {
  from: string
  to: string
}

export type GenerateInput = {
  filters: ReportFilters
  stats: StatsDashboard
  commune: Commune | null
  role: 'super_admin' | 'admin' | 'operator'
  source: 'live' | 'demo'
}

// Palette sobre — noir/zinc + emerald comme accent (cohérent avec le dashboard).
const COLOR_TEXT       = '#0a0a0a'
const COLOR_MUTED      = '#525252'
const COLOR_ACCENT     = '#059669' // emerald-600
const COLOR_ACCENT_BG  = '#d1fae5' // emerald-100
const COLOR_RULE       = '#e5e7eb'
const COLOR_BAR        = '#10b981' // emerald-500
const COLOR_BAR_TRACK  = '#f3f4f6'
const COLOR_ROW_ALT    = '#fafafa'

/**
 * Génère un PDF de rapport SportLocker en mémoire. Tient sur 1–2 pages :
 *   - Page 1 : header, résumé chiffres clés, tendance bar chart, top distributeurs
 *   - Page 2 (si nécessaire) : top articles + footer
 */
export function generatePdfBuffer(input: GenerateInput): Promise<Buffer> {
  const { filters, stats, commune, source } = input

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        // bufferPages permet d'écrire le footer (incluant "Page X / Y")
        // sur toutes les pages après coup via switchToPage. Sans buffer,
        // pdfkit émet chaque page dès qu'on dépasse la marge basse, ce qui
        // empêche d'écrire le footer après-coup proprement.
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `Rapport SportLocker ${filters.from} -> ${filters.to}`,
          Author: 'SportLocker France',
          Subject: 'Rapport synthétique d\'activité',
          Creator: 'SportLocker · ops dashboard',
        },
      })

      const chunks: Buffer[] = []
      doc.on('data', (chunk: Buffer) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const rightX = doc.page.width - 50

      // ─── HEADER ────────────────────────────────────────────────────────
      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(20).text('SportLocker', 50, 50, { continued: true })
      doc.fillColor(COLOR_ACCENT).text(' · ops')

      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(10).text(
        'Rapport synthétique d\'activité',
        50,
        doc.y + 2,
      )

      // Bloc droit : période + commune
      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(10)
        .text(formatDateRange(filters), 300, 50, { width: rightX - 300, align: 'right' })
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(9)
        .text(commune ? commune.name : 'Vue globale (toutes communes)', 300, 64, {
          width: rightX - 300, align: 'right',
        })
      if (source === 'demo') {
        doc.fillColor('#b45309').font('Helvetica-Oblique').fontSize(8)
          .text('Données de démonstration', 300, 78, {
            width: rightX - 300, align: 'right',
          })
      }

      doc.y = 100
      doc.strokeColor(COLOR_RULE).lineWidth(0.5)
        .moveTo(50, doc.y).lineTo(rightX, doc.y).stroke()
      doc.y += 12

      // ─── RÉSUMÉ — 4 KPI ────────────────────────────────────────────────
      const total       = stats.daily.reduce((a, p) => a + p.count, 0)
      const returned    = stats.byStatus.find((s) => s.status === 'returned')?.count ?? 0
      const overdue     = stats.byStatus.find((s) => s.status === 'overdue')?.count ?? 0
      const completion  = total > 0 ? Math.round((returned / total) * 100) : 0
      const peakHourly  = stats.hourly.length > 0
        ? Math.max(...stats.hourly.map((h) => h.count))
        : 0

      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11)
        .text('Résumé', 50, doc.y)
      doc.y += 16

      const cardW = (rightX - 50 - 3 * 10) / 4
      const cardH = 62
      const cardY = doc.y
      const cards: Array<[string, string, string]> = [
        ['Réservations',      String(total),    'sur la période'],
        ["Taux d'achèvement", `${completion}%`, `${returned} retournées`],
        ['En retard',         String(overdue),  `${total > 0 ? Math.round((overdue / total) * 100) : 0}% du total`],
        ['Pic horaire',       String(peakHourly), 'réservations / heure'],
      ]
      cards.forEach(([label, value, hint], i) => {
        const x = 50 + i * (cardW + 10)
        doc.roundedRect(x, cardY, cardW, cardH, 4)
          .fillAndStroke(COLOR_ACCENT_BG, COLOR_RULE)
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8)
          .text(label.toUpperCase(), x + 8, cardY + 8, { width: cardW - 16 })
        doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(20)
          .text(value, x + 8, cardY + 20, { width: cardW - 16 })
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8)
          .text(hint, x + 8, cardY + 46, { width: cardW - 16 })
      })

      doc.y = cardY + cardH + 18

      // ─── TENDANCE — bar chart simple ───────────────────────────────────
      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11)
        .text('Tendance · réservations / jour', 50, doc.y)
      doc.y += 16

      const chartX = 50
      const chartY = doc.y
      const chartW = rightX - 50
      const chartH = 110

      doc.roundedRect(chartX, chartY, chartW, chartH, 4)
        .fillAndStroke(COLOR_BAR_TRACK, COLOR_RULE)

      const series = stats.daily
      const maxVal = series.length > 0 ? Math.max(1, ...series.map((p) => p.count)) : 1
      const padX = 14
      const padY = 14
      const innerW = chartW - 2 * padX
      const innerH = chartH - 2 * padY
      const barCount = series.length
      const barSlot = barCount > 0 ? innerW / barCount : 0
      const barW = Math.max(1, barSlot * 0.7)

      series.forEach((p, i) => {
        const h = (p.count / maxVal) * innerH
        const x = chartX + padX + i * barSlot + (barSlot - barW) / 2
        const y = chartY + padY + (innerH - h)
        doc.fillColor(COLOR_BAR).rect(x, y, barW, h).fill()
      })

      // Échelle min/max
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
        .text('0', chartX + 4, chartY + chartH - 14, { width: 20 })
      doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
        .text(String(maxVal), chartX + 4, chartY + 4, { width: 20 })

      if (series.length > 0) {
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
          .text(series[0]!.date, chartX + padX, chartY + chartH + 3, {
            width: 70, align: 'left',
          })
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(7)
          .text(series[series.length - 1]!.date, chartX + chartW - padX - 70, chartY + chartH + 3, {
            width: 70, align: 'right',
          })
      }

      doc.y = chartY + chartH + 26

      // ─── TOP DISTRIBUTEURS ─────────────────────────────────────────────
      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11)
        .text('Top 5 distributeurs', 50, doc.y)
      doc.y += 12

      drawTable(
        doc,
        ['Distributeur', 'N° série', 'Réservations'],
        stats.topDistributors.slice(0, 5).map((d) => [d.name, d.serialNumber, String(d.count)]),
        [rightX - 50 - 200, 130, 70],
        rightX,
      )

      // ─── TOP ARTICLES — possibly page 2 ────────────────────────────────
      const footerReserve = 70
      const tableEstHeight = 18 * 6 + 40 // header + 5 rows + heading + padding
      if (doc.y + tableEstHeight > doc.page.height - footerReserve) {
        doc.addPage()
        doc.y = 50
      }

      doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(11)
        .text('Top 5 articles', 50, doc.y + 8)
      doc.y += 24

      drawTable(
        doc,
        ['Article', 'Réservations'],
        stats.topItemTypes.slice(0, 5).map((t) => [t.name, String(t.count)]),
        [rightX - 50 - 100, 100],
        rightX,
      )

      // ─── FOOTER (toutes pages) ─────────────────────────────────────────
      // Important : on déplace temporairement la marge basse à 0 pour
      // permettre d'écrire le footer en pied de page sans déclencher une
      // page auto (pdfkit considère qu'écrire en dessous de la marge basse
      // doit faire un saut de page).
      const range = doc.bufferedPageRange()
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)
        doc.page.margins.bottom = 0
        const fy = doc.page.height - 36
        doc.strokeColor(COLOR_RULE).lineWidth(0.5)
          .moveTo(50, fy - 8).lineTo(doc.page.width - 50, fy - 8).stroke()
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8)
          .text(
            `SportLocker France · contact@sportlocker.fr · généré le ${formatGenDate(new Date())}`,
            50, fy, { width: doc.page.width - 100, align: 'left', lineBreak: false },
          )
        doc.fillColor(COLOR_MUTED).font('Helvetica').fontSize(8)
          .text(
            `Page ${i - range.start + 1} / ${range.count}`,
            50, fy, { width: doc.page.width - 100, align: 'right', lineBreak: false },
          )
      }

      doc.end()
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/** Petite table avec en-tête + lignes alternées, sans dépendance externe. */
function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[],
  rightX: number,
): void {
  const x0 = 50
  const lineH = 18
  const headY = doc.y

  // Header
  doc.fillColor(COLOR_ACCENT_BG).rect(x0, headY, rightX - x0, lineH).fill()
  let cx = x0
  for (let i = 0; i < headers.length; i++) {
    const align: 'left' | 'right' = i === headers.length - 1 ? 'right' : 'left'
    doc.fillColor(COLOR_TEXT).font('Helvetica-Bold').fontSize(8)
      .text(headers[i]!, cx + 6, headY + 5, {
        width: (widths[i] ?? 100) - 12,
        align,
        lineBreak: false,
      })
    cx += widths[i] ?? 100
  }

  let y = headY + lineH
  if (rows.length === 0) {
    doc.fillColor(COLOR_MUTED).font('Helvetica-Oblique').fontSize(9)
      .text('Aucune donnée sur la période.', x0 + 6, y + 5, {
        width: rightX - x0 - 12, lineBreak: false,
      })
    doc.y = y + lineH
    return
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!
    if (r % 2 === 0) {
      doc.fillColor(COLOR_ROW_ALT).rect(x0, y, rightX - x0, lineH).fill()
    }
    cx = x0
    for (let i = 0; i < row.length; i++) {
      const align: 'left' | 'right' = i === row.length - 1 ? 'right' : 'left'
      doc.fillColor(COLOR_TEXT).font('Helvetica').fontSize(9)
        .text(row[i]!, cx + 6, y + 5, {
          width: (widths[i] ?? 100) - 12,
          align,
          ellipsis: true,
          lineBreak: false,
        })
      cx += widths[i] ?? 100
    }
    y += lineH
  }

  doc.strokeColor(COLOR_RULE).lineWidth(0.5)
    .moveTo(x0, headY).lineTo(rightX, headY).stroke()
  doc.strokeColor(COLOR_RULE).lineWidth(0.5)
    .moveTo(x0, y).lineTo(rightX, y).stroke()
  doc.y = y + 4
}

function formatDateRange(filters: ReportFilters): string {
  const from = formatDateFr(filters.from)
  const to   = formatDateFr(filters.to)
  return `du ${from} au ${to}`
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatGenDate(d: Date): string {
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
