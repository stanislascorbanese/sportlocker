import type { Lang } from '../lang'

/**
 * Strings de /page.tsx — la vue parc globale servie aux super-admins.
 *
 * Les clés `tenant*` ont été retirées en septembre 2026 avec le composant
 * _TenantHome : l'exploitant voit désormais « Aujourd'hui »
 * (lib/i18n/today.ts), qui ne parle plus de commune ni de parc.
 */

type HomeKey =
  // En-tête commun
  | 'pageTitleOverview' | 'metaTitle'
  // Sections
  | 'sectionTrend' | 'sectionPark' | 'sectionMaintenance' | 'sectionAlerts'
  | 'sectionMyDistributors' | 'sectionTopDistributors'
  // KPI cards
  | 'kpiDistributors' | 'kpiOnline' | 'kpiOffline' | 'kpiMaintenanceLabel'
  | 'kpiLockersFree' | 'kpiFillRate'
  | 'kpiActiveReservations' | 'kpiOverdueShort' | 'kpiOverdueHint' | 'kpiOverdueAllGood'
  | 'kpiActiveHintActive' | 'kpiActiveHintNone'
  | 'kpiOpenTickets' | 'kpiOpenTicketsHint' | 'kpiOpenTicketsHint1'
  | 'kpiAvgSeverity' | 'kpiAvgSeverityHint'
  | 'kpiImpactedSites' | 'kpiImpactedSitesHint'
  | 'kpiUnassigned' | 'kpiUnassignedHint'
  // Trend
  | 'trendLabel' | 'trendLast7Days'
  // Alerts
  | 'overdueReservations' | 'criticalTickets' | 'seeAll' | 'seeKanban'
  // Due relative
  | 'duePrefix'

const STRINGS: Record<Lang, Record<HomeKey, string>> = {
  fr: {
    pageTitleOverview:        "Vue d'ensemble",
    metaTitle:                'Accueil · SportLocker ops',

    sectionTrend:             'Tendance · réservations',
    sectionPark:              'Parc',
    sectionMaintenance:       'Maintenance',
    sectionAlerts:            'Alertes à traiter',
    sectionMyDistributors:    'Mes distributeurs',
    sectionTopDistributors:   'Top distributeurs · 30 derniers jours',

    kpiDistributors:          'Distributeurs',
    kpiOnline:                'en ligne',
    kpiOffline:               'hors ligne',
    kpiMaintenanceLabel:      'maintenance',
    kpiLockersFree:           'Casiers libres',
    kpiFillRate:              "Taux d'occupation",
    kpiActiveReservations:    'Réservations actives',
    kpiOverdueShort:          'En retard',
    kpiOverdueHint:           'Item non rendu après deadline',
    kpiOverdueAllGood:        'Tout est rentré dans les temps',
    kpiActiveHintActive:      'Emprunts en cours',
    kpiActiveHintNone:        'Aucun emprunt en cours',
    kpiOpenTickets:           'Tickets ouverts',
    kpiOpenTicketsHint:       'critiques (sév. ≥ 4)',
    kpiOpenTicketsHint1:      'critique (sév. ≥ 4)',
    kpiAvgSeverity:           'Sévérité moyenne',
    kpiAvgSeverityHint:       'Tickets ouverts uniquement, échelle 1–5',
    kpiImpactedSites:         'Sites impactés',
    kpiImpactedSitesHint:     'Distributeurs avec ≥ 1 ticket ouvert',
    kpiUnassigned:            'Non assignés',
    kpiUnassignedHint:        'Tickets ouverts sans technicien',

    trendLabel:               'Tendance · réservations',
    trendLast7Days:           '7 derniers jours',

    overdueReservations:      'Réservations en retard',
    criticalTickets:          'Tickets critiques ouverts',
    seeAll:                   'voir tout →',
    seeKanban:                'voir kanban →',

    duePrefix:                'dû',


  },
  en: {
    pageTitleOverview:        'Overview',
    metaTitle:                'Home · SportLocker ops',

    sectionTrend:             'Reservation trend',
    sectionPark:              'Fleet',
    sectionMaintenance:       'Maintenance',
    sectionAlerts:            'Alerts to address',
    sectionMyDistributors:    'My distributors',
    sectionTopDistributors:   'Top distributors · last 30 days',

    kpiDistributors:          'Distributors',
    kpiOnline:                'online',
    kpiOffline:               'offline',
    kpiMaintenanceLabel:      'maintenance',
    kpiLockersFree:           'Free lockers',
    kpiFillRate:              'Fill rate',
    kpiActiveReservations:    'Active reservations',
    kpiOverdueShort:          'Overdue',
    kpiOverdueHint:           'Item not returned past deadline',
    kpiOverdueAllGood:        'Everything returned on time',
    kpiActiveHintActive:      'Loans in progress',
    kpiActiveHintNone:        'No active loans',
    kpiOpenTickets:           'Open tickets',
    kpiOpenTicketsHint:       'critical (sev. ≥ 4)',
    kpiOpenTicketsHint1:      'critical (sev. ≥ 4)',
    kpiAvgSeverity:           'Average severity',
    kpiAvgSeverityHint:       'Open tickets only, scale 1–5',
    kpiImpactedSites:         'Impacted sites',
    kpiImpactedSitesHint:     'Distributors with ≥ 1 open ticket',
    kpiUnassigned:            'Unassigned',
    kpiUnassignedHint:        'Open tickets without a tech',

    trendLabel:               'Reservation trend',
    trendLast7Days:           'last 7 days',

    overdueReservations:      'Overdue reservations',
    criticalTickets:          'Open critical tickets',
    seeAll:                   'see all →',
    seeKanban:                'see kanban →',

    duePrefix:                'due',


  },
}

export function homeStrings(lang: Lang): Record<HomeKey, string> {
  return STRINGS[lang]
}
