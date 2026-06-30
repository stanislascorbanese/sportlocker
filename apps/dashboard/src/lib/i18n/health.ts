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
  // Detail page /distributors/:id/health
  | 'detailMetaTitle'
  | 'btnEdit' | 'btnBackToFleet'
  | 'windowSelect24h' | 'windowSelect3d' | 'windowSelect7d'
  | 'silent' | 'live' | 'seen'
  | 'fwShort'
  | 'noHeartbeat' | 'noHeartbeatHint'
  | 'windowHoursShort' | 'windowDaysShort'
  | 'kpiAvailability' | 'kpiAvailabilityHint'
  | 'kpiCpu' | 'kpiCpuHintMax' | 'kpiNoMeasure'
  | 'kpiSignal' | 'kpiSignalHintAvg'
  | 'kpiMemory' | 'kpiMemoryHintMin'
  | 'heartbeatsReceived' | 'uptimeLabel' | 'lastPacket'
  | 'telemetryTitle'
  | 'chartCpu' | 'chartRssi' | 'chartMemory'
  | 'metricMin' | 'metricMax' | 'metricNoData'

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

    detailMetaTitle:     'Santé distributeur · SportLocker ops',
    btnEdit:             'Modifier',
    btnBackToFleet:      '← Parc',
    windowSelect24h:     '24 h',
    windowSelect3d:      '3 j',
    windowSelect7d:      '7 j',
    silent:              'silencieux',
    live:                'en ligne',
    seen:                'vu',
    fwShort:             'fw',
    noHeartbeat:         'Aucun heartbeat reçu sur les %p écoulés.',
    noHeartbeatHint:     "Le firmware n'a rien publié — distributeur hors-ligne, ou pas encore appairé.",
    windowHoursShort:    '%d h',
    windowDaysShort:     '%d j',
    kpiAvailability:     'Disponibilité',
    kpiAvailabilityHint: 'sur %p · tranches de 5 min',
    kpiCpu:              'Température CPU',
    kpiCpuHintMax:       'max %s',
    kpiNoMeasure:        'pas de mesure',
    kpiSignal:           'Signal réseau',
    kpiSignalHintAvg:    'moy. %s',
    kpiMemory:           'Mémoire libre',
    kpiMemoryHintMin:    'min %s',
    heartbeatsReceived:  '%d heartbeats reçus',
    uptimeLabel:         'uptime',
    lastPacket:          'dernier paquet',
    telemetryTitle:      'Télémétrie · moyenne horaire',
    chartCpu:            'Température CPU',
    chartRssi:           'Signal (RSSI)',
    chartMemory:         'Mémoire libre',
    metricMin:           'min',
    metricMax:           'max',
    metricNoData:        'aucune donnée sur la période',
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

    detailMetaTitle:     'Distributor health · SportLocker ops',
    btnEdit:             'Edit',
    btnBackToFleet:      '← Fleet',
    windowSelect24h:     '24h',
    windowSelect3d:      '3d',
    windowSelect7d:      '7d',
    silent:              'silent',
    live:                'live',
    seen:                'seen',
    fwShort:             'fw',
    noHeartbeat:         'No heartbeat received in the past %p.',
    noHeartbeatHint:     'Firmware hasn\'t published — distributor offline or not paired yet.',
    windowHoursShort:    '%dh',
    windowDaysShort:     '%dd',
    kpiAvailability:     'Availability',
    kpiAvailabilityHint: 'over %p · 5-min buckets',
    kpiCpu:              'CPU temperature',
    kpiCpuHintMax:       'max %s',
    kpiNoMeasure:        'no measurement',
    kpiSignal:           'Network signal',
    kpiSignalHintAvg:    'avg %s',
    kpiMemory:           'Free memory',
    kpiMemoryHintMin:    'min %s',
    heartbeatsReceived:  '%d heartbeats received',
    uptimeLabel:         'uptime',
    lastPacket:          'last packet',
    telemetryTitle:      'Telemetry · hourly average',
    chartCpu:            'CPU temperature',
    chartRssi:           'Signal (RSSI)',
    chartMemory:         'Free memory',
    metricMin:           'min',
    metricMax:           'max',
    metricNoData:        'no data for the period',
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
