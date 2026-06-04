import type { Lang } from '../lang'
import type { ReservationStatus } from '../api'

type StatsKey =
  | 'pageTitle' | 'metaTitle'
  | 'subtitleN' | 'subtitleDays' | 'subtitleCompletionRate'
  | 'rangeLast'
  | 'trendTitle' | 'trendSub'
  | 'statusBreakdown' | 'centerLabel'
  | 'statActives' | 'statOverdue' | 'statReturned'
  | 'topDistributors' | 'topItemTypes'
  | 'heatmapTitle' | 'heatmapSub'

const STRINGS: Record<Lang, Record<StatsKey, string>> = {
  fr: {
    pageTitle:             'Stats',
    metaTitle:             'Stats · SportLocker ops',
    subtitleN:             'réservations',
    subtitleDays:          'sur les %d derniers jours',
    subtitleCompletionRate:'taux d’achèvement',
    rangeLast:             'derniers jours',
    trendTitle:            'Tendance · réservations / jour',
    trendSub:              '%d derniers jours',
    statusBreakdown:       'Répartition par statut',
    centerLabel:           'total',
    statActives:           'Actives',
    statOverdue:           'En retard',
    statReturned:          'Retournées',
    topDistributors:       'Top distributeurs',
    topItemTypes:          'Articles les plus empruntés',
    heatmapTitle:          'Heures de pointe · jour de semaine × heure',
    heatmapSub:            'agrégé sur %d jours',
  },
  en: {
    pageTitle:             'Stats',
    metaTitle:             'Stats · SportLocker ops',
    subtitleN:             'reservations',
    subtitleDays:          'over the last %d days',
    subtitleCompletionRate:'completion rate',
    rangeLast:             'last days',
    trendTitle:            'Trend · reservations / day',
    trendSub:              'last %d days',
    statusBreakdown:       'Breakdown by status',
    centerLabel:           'total',
    statActives:           'Active',
    statOverdue:           'Overdue',
    statReturned:          'Returned',
    topDistributors:       'Top distributors',
    topItemTypes:          'Most borrowed items',
    heatmapTitle:          'Peak hours · day of week × hour',
    heatmapSub:            'aggregated over %d days',
  },
}

export function statsStrings(lang: Lang): Record<StatsKey, string> {
  return STRINGS[lang]
}

const RES_STATUS: Record<Lang, Record<ReservationStatus, string>> = {
  fr: {
    scheduled: 'planifiée',
    pending:   'en attente',
    active:    'active',
    returned:  'retournée',
    overdue:   'en retard',
    cancelled: 'annulée',
    expired:   'expirée',
  },
  en: {
    scheduled: 'scheduled',
    pending:   'pending',
    active:    'active',
    returned:  'returned',
    overdue:   'overdue',
    cancelled: 'cancelled',
    expired:   'expired',
  },
}

export function reservationStatusLabel(lang: Lang, status: ReservationStatus): string {
  return RES_STATUS[lang][status]
}
