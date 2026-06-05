import type { Lang } from '../lang'
import type { FleetAlert } from '../api'

type HealthKey =
  | 'pageTitle' | 'metaTitle'
  | 'subtitle1' | 'subtitleMany'
  | 'allHealthy'
  | 'withAlertsPrefix' | 'withAlertsSuffix'
  // Filters
  | 'filterAll' | 'filterWithAlerts'
  // Table
  | 'colDistributor' | 'colCommune' | 'colStatus' | 'colLastSeen'
  | 'colCpu' | 'colRssi' | 'colMemory' | 'colTickets' | 'colAlerts'
  | 'colActions'
  | 'detail' | 'firmware' | 'serial'
  | 'noData' | 'noDataShort'
  // Empty
  | 'emptyState' | 'emptyHint'
  // Help
  | 'thresholdsHelp'

const STRINGS: Record<Lang, Record<HealthKey, string>> = {
  fr: {
    pageTitle:           'Santé du parc',
    metaTitle:           'Santé du parc · SportLocker ops',
    subtitle1:           'distributeur supervisé',
    subtitleMany:        'distributeurs supervisés',
    allHealthy:          '✓ Tout va bien — aucune alerte sur le parc.',
    withAlertsPrefix:    'avec',
    withAlertsSuffix:    'alerte(s) actives',
    filterAll:           'Tous',
    filterWithAlerts:    'Avec alertes seulement',
    colDistributor:      'Distributeur',
    colCommune:          'Commune',
    colStatus:           'Statut',
    colLastSeen:         'Dernier signe',
    colCpu:              'CPU °C',
    colRssi:             'Signal',
    colMemory:           'Mém. libre',
    colTickets:          'Tickets',
    colAlerts:           'Alertes',
    colActions:          'Détails',
    detail:              'Détail →',
    firmware:            'fw',
    serial:              'série',
    noData:              '—',
    noDataShort:         '—',
    emptyState:          'Aucun distributeur en service dans votre périmètre.',
    emptyHint:           'Les distributeurs désactivés n\'apparaissent pas dans cette vue.',
    thresholdsHelp:      'Seuils : CPU > 75°C · Signal < -80 dBm · Mémoire libre < 64 Mo · Heartbeat absent > 24 h · ticket critique sév. ≥ 4.',
  },
  en: {
    pageTitle:           'Fleet health',
    metaTitle:           'Fleet health · SportLocker ops',
    subtitle1:           'monitored distributor',
    subtitleMany:        'monitored distributors',
    allHealthy:          '✓ All good — no alerts in the fleet.',
    withAlertsPrefix:    'with',
    withAlertsSuffix:    'active alert(s)',
    filterAll:           'All',
    filterWithAlerts:    'With alerts only',
    colDistributor:      'Distributor',
    colCommune:          'Commune',
    colStatus:           'Status',
    colLastSeen:         'Last seen',
    colCpu:              'CPU °C',
    colRssi:             'Signal',
    colMemory:           'Free mem',
    colTickets:          'Tickets',
    colAlerts:           'Alerts',
    colActions:          'Details',
    detail:              'Detail →',
    firmware:            'fw',
    serial:              'serial',
    noData:              '—',
    noDataShort:         '—',
    emptyState:          'No distributor in service in your scope.',
    emptyHint:           'Decommissioned distributors do not appear in this view.',
    thresholdsHelp:      'Thresholds: CPU > 75°C · Signal < -80 dBm · Free memory < 64 MB · Heartbeat missing > 24h · critical ticket sev. ≥ 4.',
  },
}

export function healthStrings(lang: Lang): Record<HealthKey, string> {
  return STRINGS[lang]
}

const ALERT_LABELS: Record<Lang, Record<FleetAlert, string>> = {
  fr: {
    offline:           'Hors ligne',
    no_heartbeat_24h:  'Silence > 24 h',
    high_cpu_temp:     'CPU trop chaud',
    weak_signal:       'Signal faible',
    low_memory:        'Mémoire basse',
    open_critical:     'Ticket critique',
  },
  en: {
    offline:           'Offline',
    no_heartbeat_24h:  'Silent > 24h',
    high_cpu_temp:     'High CPU temp',
    weak_signal:       'Weak signal',
    low_memory:        'Low memory',
    open_critical:     'Critical ticket',
  },
}

export function alertLabel(lang: Lang, alert: FleetAlert): string {
  return ALERT_LABELS[lang][alert]
}
