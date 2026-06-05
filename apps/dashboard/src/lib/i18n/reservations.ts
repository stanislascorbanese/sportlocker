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
  // ReservationDrawer
  | 'drawerSrLabel' | 'drawerCloseAria' | 'drawerCloseBackdropAria'
  | 'drawerReservation' | 'drawerLoading'
  | 'drawerUser' | 'drawerSeeUserProfile'
  | 'drawerDistributor' | 'drawerSeeSheet' | 'drawerItem'
  | 'drawerLifecycle'
  | 'drawerCreated' | 'drawerExpiresQr' | 'drawerOpened' | 'drawerDueAt'
  | 'drawerReturned' | 'drawerExtensions' | 'drawerCancellationReason' | 'drawerQrJti'
  | 'drawerTimeline' | 'drawerEvent1' | 'drawerEventMany' | 'drawerNoEvents'
  | 'drawerSourcePrefix'
  | 'drawerForceCancelHint'
  // ExportCsvButton
  | 'exportBtnIdle' | 'exportBtnPending' | 'exportDemoToast'
  // ForceCancelButton
  | 'fcDemoBlocker' | 'fcPrompt' | 'fcBtnIdle' | 'fcBtnPending'

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

    drawerSrLabel:        'Détail réservation',
    drawerCloseAria:      'Fermer',
    drawerCloseBackdropAria:'Fermer le détail',
    drawerReservation:    'Réservation',
    drawerLoading:        'Chargement…',
    drawerUser:           'Utilisateur',
    drawerSeeUserProfile: 'voir profil utilisateur →',
    drawerDistributor:    'Distributeur',
    drawerSeeSheet:       'fiche →',
    drawerItem:           'Article',
    drawerLifecycle:      'Cycle de vie',
    drawerCreated:        'Créée',
    drawerExpiresQr:      'Expire (QR)',
    drawerOpened:         'Ouverte',
    drawerDueAt:          'Due le',
    drawerReturned:       'Retournée',
    drawerExtensions:     'Prolongations',
    drawerCancellationReason:'Raison annulation',
    drawerQrJti:          'QR JTI',
    drawerTimeline:       'Timeline',
    drawerEvent1:         'événement',
    drawerEventMany:      'événements',
    drawerNoEvents:       'aucun événement enregistré',
    drawerSourcePrefix:   'source',
    drawerForceCancelHint:"Annulation forcée : libère le casier et trace l'événement.",

    exportBtnIdle:        'Exporter CSV',
    exportBtnPending:     'Export…',
    exportDemoToast:      'Export téléchargé (mode démo — données fictives).',

    fcDemoBlocker:        "Mode démo — branchez un token admin valide pour exécuter l'action.",
    fcPrompt:             'Raison de l\'annulation forcée (min. 4 caractères) :\n\nLe casier sera libéré et un événement « cancelled » sera tracé avec source=admin.',
    fcBtnIdle:            'Annulation forcée',
    fcBtnPending:         'Annulation…',
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

    drawerSrLabel:        'Reservation detail',
    drawerCloseAria:      'Close',
    drawerCloseBackdropAria:'Close detail',
    drawerReservation:    'Reservation',
    drawerLoading:        'Loading…',
    drawerUser:           'User',
    drawerSeeUserProfile: 'see user profile →',
    drawerDistributor:    'Distributor',
    drawerSeeSheet:       'sheet →',
    drawerItem:           'Item',
    drawerLifecycle:      'Lifecycle',
    drawerCreated:        'Created',
    drawerExpiresQr:      'Expires (QR)',
    drawerOpened:         'Opened',
    drawerDueAt:          'Due',
    drawerReturned:       'Returned',
    drawerExtensions:     'Extensions',
    drawerCancellationReason:'Cancellation reason',
    drawerQrJti:          'QR JTI',
    drawerTimeline:       'Timeline',
    drawerEvent1:         'event',
    drawerEventMany:      'events',
    drawerNoEvents:       'no events recorded',
    drawerSourcePrefix:   'source',
    drawerForceCancelHint:'Force-cancel releases the locker and traces the event.',

    exportBtnIdle:        'Export CSV',
    exportBtnPending:     'Exporting…',
    exportDemoToast:      'Export downloaded (demo mode — sample data).',

    fcDemoBlocker:        'Demo mode — connect a valid admin token to perform this action.',
    fcPrompt:             'Force-cancel reason (min. 4 chars):\n\nThe locker will be released and a "cancelled" event will be traced with source=admin.',
    fcBtnIdle:            'Force-cancel',
    fcBtnPending:         'Cancelling…',
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
