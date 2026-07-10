'use server'

import {
  ApiError,
  fetchCommunes,
  fetchStatsDashboard,
  type Commune,
  type StatsDashboard,
} from '../../lib/api'
import { isDemoFallbackEnabled } from '../../lib/demo-fallback'
import { getSessionUser } from '../../lib/session-server'

import { generatePdfBuffer, type ReportFilters } from './pdf-generator'

export type { ReportFilters }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type PdfResult =
  | { ok: true; base64: string; filename: string; source: 'live' | 'demo' }
  | { ok: false; error: string }

/**
 * Server Action déclenchée par le bouton "Télécharger PDF". Récupère les
 * stats sur la fenêtre demandée, bascule en démo si l'API renvoie 401/403
 * ou si tout est vide, puis génère un Buffer PDF qu'on renvoie en base64
 * (le client le décode en Blob → ObjectURL → click sur <a download>).
 */
export async function generateReportAction(filters: ReportFilters): Promise<PdfResult> {
  if (!DATE_RE.test(filters.from) || !DATE_RE.test(filters.to)) {
    return { ok: false, error: 'Dates invalides (attendu YYYY-MM-DD).' }
  }
  if (filters.from > filters.to) {
    return { ok: false, error: 'Date de début postérieure à la date de fin.' }
  }

  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Session expirée — reconnectez-vous.' }

  // Côté API on n'a que `days` (fenêtre glissante depuis today). On prend la
  // plage qui couvre la période demandée et on filtrera la daily côté Node.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const fromDate = new Date(`${filters.from}T00:00:00Z`)
  const diffDays = Math.max(1, Math.ceil((today.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
  const days = Math.min(365, Math.max(7, diffDays))

  let stats: StatsDashboard
  let source: 'live' | 'demo' = 'live'
  let communes: Commune[] = []
  try {
    stats = await fetchStatsDashboard(days)
    try {
      communes = await fetchCommunes()
    } catch {
      communes = []
    }
  } catch (err) {
    if (isDemoFallbackEnabled() && err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      // Lazy-load demo-data uniquement en fallback (code-splitting serveur).
      // Coupé en prod (garde) : on propage alors la vraie erreur d'API.
      const demo = await import('../../lib/demo-data')
      stats = demo.demoStatsDashboard(days)
      communes = demo.DEMO_COMMUNES
      source = 'demo'
    } else {
      return { ok: false, error: err instanceof Error ? err.message : 'Erreur inconnue.' }
    }
  }

  // Si tout est vide après live, on bascule en démo pour avoir un PDF utile.
  const allZero = stats.daily.every((p) => p.count === 0)
    && stats.topDistributors.every((d) => d.count === 0)
  if (isDemoFallbackEnabled() && source === 'live' && allZero) {
    const demo = await import('../../lib/demo-data')
    stats = demo.demoStatsDashboard(days)
    if (communes.length === 0) communes = demo.DEMO_COMMUNES
    source = 'demo'
  }

  const commune = user.role === 'admin' && user.communeId
    ? communes.find((c) => c.id === user.communeId) ?? null
    : null

  const scoped = scopeStats(stats, filters)

  let buffer: Buffer
  try {
    buffer = await generatePdfBuffer({
      filters,
      stats: scoped,
      commune,
      role: user.role,
      source,
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erreur génération PDF.' }
  }

  const slug = commune ? slugify(commune.name) : 'global'
  const filename = `sportlocker-rapport-${slug}-${filters.from}_${filters.to}.pdf`

  return {
    ok: true,
    base64: buffer.toString('base64'),
    filename,
    source,
  }
}

/** Restreint la série daily aux jours de la fenêtre [from, to]. Les autres
 *  agrégats (topDistributors, byStatus, topItemTypes, hourly) sont conservés
 *  tels quels — leur fenêtre vient déjà de l'appel API `days=` côté serveur. */
function scopeStats(stats: StatsDashboard, filters: ReportFilters): StatsDashboard {
  const daily = stats.daily.filter((p) => p.date >= filters.from && p.date <= filters.to)
  return { ...stats, daily }
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'commune'
}
