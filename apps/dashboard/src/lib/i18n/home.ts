import type { Lang } from '../lang'

/**
 * Strings du /page.tsx (home super_admin + parc global) ET de _TenantHome
 * (home admin scopé commune). Les 2 partagent les mêmes KPI cards / sections.
 */

type HomeKey =
  // En-tête commun
  | 'pageTitleOverview' | 'pageTitleTenant' | 'metaTitle'
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
  // _TenantHome specific
  | 'tenantSnapshotLabel'
  | 'tenantParcCount' | 'tenantBookingsActive' | 'tenantOpenTicketsLabel'
  | 'topRevenueTitle' | 'topRevenueHint'
  | 'tenantGreeting'
  | 'tenantDistributorsInService1' | 'tenantDistributorsInServiceMany'
  | 'tenantLockersFree' | 'tenantFillRate'
  | 'tenantToday' | 'tenantThisWeek'
  | 'tenantViewDetailedStats'
  | 'tenantOngoingReservations' | 'tenantOverdue' | 'tenantOpenTickets'
  | 'tenantCriticalOf' | 'tenantCriticalOfOne'
  | 'tenantYourDistributors' | 'tenantOfflineSuffix'
  | 'tenantNoDistributors' | 'tenantNoDistributorsHint'
  | 'tenantCriticalTickets'
  | 'tenantFooterPart1' | 'tenantFooterOpenTicket' | 'tenantFooterOrContact'

const STRINGS: Record<Lang, Record<HomeKey, string>> = {
  fr: {
    pageTitleOverview:        "Vue d'ensemble",
    pageTitleTenant:          "Tableau de bord",
    metaTitle:                'Accueil · SportLocker ops',

    sectionTrend:             'Tendance · réservations',
    sectionPark:              'Parc',
    sectionMaintenance:       'Maintenance',
    sectionAlerts:            'Alertes à traiter',
    sectionMyDistributors:    'Mes distributeurs',
    sectionTopDistributors:   'Top distributeurs · 30 derniers jours',

    kpiDistributors:          'Distributeurs',
    kpiOnline:                'online',
    kpiOffline:               'offline',
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

    tenantSnapshotLabel:      'Aperçu',
    tenantParcCount:          'distributeurs',
    tenantBookingsActive:     'emprunts en cours',
    tenantOpenTicketsLabel:   'tickets ouverts',
    topRevenueTitle:          'Revenus locations',
    topRevenueHint:           '30 derniers jours · vos distributeurs uniquement',

    tenantGreeting:                    'Bonjour,',
    tenantDistributorsInService1:      'distributeur en service',
    tenantDistributorsInServiceMany:   'distributeurs en service',
    tenantLockersFree:                 'casiers libres',
    tenantFillRate:                    "taux d'occupation",
    tenantToday:                       "Aujourd'hui",
    tenantThisWeek:                    'Cette semaine',
    tenantViewDetailedStats:           'voir stats détaillées →',
    tenantOngoingReservations:         'Réservations en cours',
    tenantOverdue:                     'En retard',
    tenantOpenTickets:                 'Tickets ouverts',
    tenantCriticalOf:                  'dont %d critiques',
    tenantCriticalOfOne:               'dont 1 critique',
    tenantYourDistributors:            'Vos distributeurs',
    tenantOfflineSuffix:               'hors ligne',
    tenantNoDistributors:              "Aucun distributeur installé sur votre commune pour l'instant.",
    tenantNoDistributorsHint:          "Contactez votre référent SportLocker pour planifier l'installation.",
    tenantCriticalTickets:             'Tickets critiques',
    tenantFooterPart1:                 "Besoin d'aide ? Un casier bloqué, un distributeur hors ligne ?",
    tenantFooterOpenTicket:            'Ouvrez un ticket de maintenance',
    tenantFooterOrContact:             'ou contactez',
  },
  en: {
    pageTitleOverview:        'Overview',
    pageTitleTenant:          'Dashboard',
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

    tenantSnapshotLabel:      'Snapshot',
    tenantParcCount:          'distributors',
    tenantBookingsActive:     'active loans',
    tenantOpenTicketsLabel:   'open tickets',
    topRevenueTitle:          'Booking revenue',
    topRevenueHint:           'last 30 days · your distributors only',

    tenantGreeting:                    'Hello,',
    tenantDistributorsInService1:      'distributor in service',
    tenantDistributorsInServiceMany:   'distributors in service',
    tenantLockersFree:                 'free lockers',
    tenantFillRate:                    'fill rate',
    tenantToday:                       'Today',
    tenantThisWeek:                    'This week',
    tenantViewDetailedStats:           'view detailed stats →',
    tenantOngoingReservations:         'Active reservations',
    tenantOverdue:                     'Overdue',
    tenantOpenTickets:                 'Open tickets',
    tenantCriticalOf:                  'including %d critical',
    tenantCriticalOfOne:               'including 1 critical',
    tenantYourDistributors:            'Your distributors',
    tenantOfflineSuffix:               'offline',
    tenantNoDistributors:              'No distributors installed in your commune yet.',
    tenantNoDistributorsHint:          'Contact your SportLocker rep to schedule installation.',
    tenantCriticalTickets:             'Critical tickets',
    tenantFooterPart1:                 'Need help? A stuck locker, an offline distributor?',
    tenantFooterOpenTicket:            'Open a maintenance ticket',
    tenantFooterOrContact:             'or contact',
  },
}

export function homeStrings(lang: Lang): Record<HomeKey, string> {
  return STRINGS[lang]
}
