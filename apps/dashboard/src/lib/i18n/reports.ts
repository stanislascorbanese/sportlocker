import type { Lang } from '../lang'

type ReportsKey =
  | 'pageTitle' | 'metaTitle'
  | 'globalView'
  | 'day1' | 'dayMany'
  | 'preset30d' | 'presetThisMonth' | 'presetLastMonth'
  | 'apply'
  // KPIs
  | 'kpiTotal' | 'kpiTotalHint'
  | 'kpiCompleted' | 'kpiCompletedHint'
  | 'kpiOverdue' | 'kpiOverdueHint'
  | 'kpiCompletionRate' | 'kpiCompletionRateHint'
  | 'kpiOpenTickets' | 'kpiOpenTicketsHint'
  | 'kpiActiveDistributors' | 'kpiActiveDistributorsHint' | 'kpiActiveDistributorsOn'
  | 'kpiAvgOccupancy' | 'kpiAvgOccupancyHint'
  | 'kpiHourPeak' | 'kpiHourPeakHint'
  // Sections
  | 'trendTitle' | 'trendSub'
  | 'topDistributors' | 'topItemTypes'
  | 'heatmapTitle' | 'heatmapSub'
  // Footer + Download button
  | 'pdfHint'
  | 'pdfDownload' | 'pdfGenerating' | 'pdfUnknownError'

const STRINGS: Record<Lang, Record<ReportsKey, string>> = {
  fr: {
    pageTitle:           'Rapports',
    metaTitle:           'Rapports · SportLocker ops',
    globalView:          'Vue globale',
    day1:                'jour',
    dayMany:             'jours',
    preset30d:           '30 derniers jours',
    presetThisMonth:     'Mois en cours',
    presetLastMonth:     'Mois précédent',
    apply:               'Appliquer',

    kpiTotal:                  'Réservations totales',
    kpiTotalHint:              'sur la période choisie',
    kpiCompleted:              'Achevées',
    kpiCompletedHint:          '%d%% du total',
    kpiOverdue:                'En retard',
    kpiOverdueHint:            '%d%% du total',
    kpiCompletionRate:         'Taux d’achèvement',
    kpiCompletionRateHint:     '%d actives en parallèle',
    kpiOpenTickets:            'Tickets ouverts',
    kpiOpenTicketsHint:        'maintenance en cours',
    kpiActiveDistributors:     'Distributeurs actifs',
    kpiActiveDistributorsHint: 'tout le parc',
    kpiActiveDistributorsOn:   'sur',
    kpiAvgOccupancy:           'Occupation moyenne',
    kpiAvgOccupancyHint:       '%a / %b casiers occupés',
    kpiHourPeak:               'Pic horaire',
    kpiHourPeakHint:           'réservations / heure / jour',

    trendTitle:          'Tendance · réservations / jour',
    trendSub:            'période choisie',
    topDistributors:     'Top 5 distributeurs',
    topItemTypes:        'Top 5 articles',
    heatmapTitle:        'Heures de pointe · jour de semaine × heure',
    heatmapSub:          'agrégé sur la période',

    pdfHint:             'Le bouton « Télécharger PDF » génère un rapport synthétique à transmettre au conseil municipal — entête commune, chiffres clés, top distributeurs & articles.',
    pdfDownload:         'Télécharger PDF',
    pdfGenerating:       'Génération…',
    pdfUnknownError:     'Erreur inconnue',
  },
  en: {
    pageTitle:           'Reports',
    metaTitle:           'Reports · SportLocker ops',
    globalView:          'Global view',
    day1:                'day',
    dayMany:             'days',
    preset30d:           'Last 30 days',
    presetThisMonth:     'This month',
    presetLastMonth:     'Last month',
    apply:               'Apply',

    kpiTotal:                  'Total reservations',
    kpiTotalHint:              'over the chosen period',
    kpiCompleted:              'Completed',
    kpiCompletedHint:          '%d%% of total',
    kpiOverdue:                'Overdue',
    kpiOverdueHint:            '%d%% of total',
    kpiCompletionRate:         'Completion rate',
    kpiCompletionRateHint:     '%d active in parallel',
    kpiOpenTickets:            'Open tickets',
    kpiOpenTicketsHint:        'maintenance in progress',
    kpiActiveDistributors:     'Active distributors',
    kpiActiveDistributorsHint: 'whole fleet',
    kpiActiveDistributorsOn:   'on',
    kpiAvgOccupancy:           'Average occupancy',
    kpiAvgOccupancyHint:       '%a / %b lockers in use',
    kpiHourPeak:               'Peak hour',
    kpiHourPeakHint:           'reservations / hour / day',

    trendTitle:          'Trend · reservations / day',
    trendSub:            'chosen period',
    topDistributors:     'Top 5 distributors',
    topItemTypes:        'Top 5 items',
    heatmapTitle:        'Peak hours · day of week × hour',
    heatmapSub:          'aggregated over the period',

    pdfHint:             'The "Download PDF" button generates a summary report for sharing with the city council — commune header, key figures, top distributors & items.',
    pdfDownload:         'Download PDF',
    pdfGenerating:       'Generating…',
    pdfUnknownError:     'Unknown error',
  },
}

export function reportsStrings(lang: Lang): Record<ReportsKey, string> {
  return STRINGS[lang]
}
