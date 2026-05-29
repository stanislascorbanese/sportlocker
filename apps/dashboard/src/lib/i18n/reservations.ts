import type { Lang } from '../lang'
import type { ReservationStatus } from '../api'

type ReservationsKey =
  | 'pageTitle' | 'metaTitle'
  | 'displayed1' | 'displayedMany' | 'paginationAvailable'
  | 'colCreatedAt' | 'colUser' | 'colDistributor' | 'colItem'
  | 'colStatus' | 'colDueAt' | 'colExtensions'
  | 'extensionsAbbrev'
  | 'filterDistributor'
  | 'emptyForFilters'
  | 'distributorNotFoundDemo' | 'reservationNotFound' | 'detailLoadError'

const STRINGS: Record<Lang, Record<ReservationsKey, string>> = {
  fr: {
    pageTitle:            'Réservations',
    metaTitle:            'Réservations · SportLocker ops',
    displayed1:           'affichée',
    displayedMany:        'affichées',
    paginationAvailable:  'pagination disponible',
    colCreatedAt:         'Créée le',
    colUser:              'Utilisateur',
    colDistributor:       'Distributeur',
    colItem:              'Article',
    colStatus:            'Statut',
    colDueAt:             'Échéance',
    colExtensions:        'Prolong.',
    extensionsAbbrev:     'Prolong.',
    filterDistributor:    'Distributeur',
    emptyForFilters:      'Aucune réservation pour ces filtres.',
    distributorNotFoundDemo: 'Réservation introuvable dans les données démo.',
    reservationNotFound:  'Réservation introuvable.',
    detailLoadError:      'Erreur de chargement du détail.',
  },
  en: {
    pageTitle:            'Reservations',
    metaTitle:            'Reservations · SportLocker ops',
    displayed1:           'shown',
    displayedMany:        'shown',
    paginationAvailable:  'pagination available',
    colCreatedAt:         'Created at',
    colUser:              'User',
    colDistributor:       'Distributor',
    colItem:              'Item',
    colStatus:            'Status',
    colDueAt:             'Due',
    colExtensions:        'Ext.',
    extensionsAbbrev:     'Ext.',
    filterDistributor:    'Distributor',
    emptyForFilters:      'No reservations match these filters.',
    distributorNotFoundDemo: 'Reservation not found in demo data.',
    reservationNotFound:  'Reservation not found.',
    detailLoadError:      'Failed to load reservation detail.',
  },
}

export function reservationsStrings(lang: Lang): Record<ReservationsKey, string> {
  return STRINGS[lang]
}

// Statuts de réservation — utilisés à la fois dans /reservations et dans
// /audit / autres pages. Centralisés ici.
const STATUS_LABELS: Record<Lang, Record<ReservationStatus, string>> = {
  fr: {
    scheduled: 'programmée',
    pending:   'en attente',
    active:    'active',
    returned:  'rendue',
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
  return STATUS_LABELS[lang][status]
}
