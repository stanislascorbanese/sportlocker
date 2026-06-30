import type { Lang } from '../lang'
import type { LockerEventType } from '../api'

type AuditKey =
  | 'pageTitle' | 'metaTitle'
  | 'event1' | 'eventMany' | 'displayed1' | 'displayedMany' | 'pagination'
  | 'type' | 'source' | 'sourceAll' | 'distributor'
  | 'emptyForFilters'
  | 'rowDistributor' | 'rowLocker' | 'rowUser' | 'rowSeeReservation'

const STRINGS: Record<Lang, Record<AuditKey, string>> = {
  fr: {
    pageTitle:         'Audit / Activité',
    metaTitle:         'Audit · SportLocker ops',
    event1:            'événement',
    eventMany:         'événements',
    displayed1:        'affiché',
    displayedMany:     'affichés',
    pagination:        'pagination disponible',
    type:              'Type',
    source:            'Source',
    sourceAll:         'Toutes',
    distributor:       'Distributeur',
    emptyForFilters:   'Aucun événement pour ces filtres.',
    rowDistributor:    'Distributeur',
    rowLocker:         'Casier',
    rowUser:           'Utilisateur',
    rowSeeReservation: 'voir réservation →',
  },
  en: {
    pageTitle:         'Audit / Activity',
    metaTitle:         'Audit · SportLocker ops',
    event1:            'event',
    eventMany:         'events',
    displayed1:        'shown',
    displayedMany:     'shown',
    pagination:        'pagination available',
    type:              'Type',
    source:            'Source',
    sourceAll:         'All',
    distributor:       'Distributor',
    emptyForFilters:   'No events match these filters.',
    rowDistributor:    'Distributor',
    rowLocker:         'Locker',
    rowUser:           'User',
    rowSeeReservation: 'see reservation →',
  },
}

export function auditStrings(lang: Lang): Record<AuditKey, string> {
  return STRINGS[lang]
}

const EVENT_LABELS: Record<Lang, Record<LockerEventType, string>> = {
  fr: {
    reserved:    'Réservé',
    opened:      'Ouverture casier',
    closed:      'Fermeture casier',
    extended:    'Prolongation',
    returned:    'Retour confirmé',
    cancelled:   'Annulé',
    expired:     'Expiré',
    fault:       'Incident',
    maintenance: 'Maintenance',
  },
  en: {
    reserved:    'Reserved',
    opened:      'Locker opened',
    closed:      'Locker closed',
    extended:    'Extended',
    returned:    'Return confirmed',
    cancelled:   'Cancelled',
    expired:     'Expired',
    fault:       'Incident',
    maintenance: 'Maintenance',
  },
}

export function lockerEventLabel(lang: Lang, t: LockerEventType): string {
  return EVENT_LABELS[lang][t]
}
