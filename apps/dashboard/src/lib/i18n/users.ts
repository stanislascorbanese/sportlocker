import type { Lang } from '../lang'
import type { UserRole } from '../api'

type UsersKey =
  | 'pageTitle' | 'metaTitle'
  | 'displayed1' | 'displayedMany' | 'staff'
  | 'banned1' | 'bannedMany' | 'gdprPending'
  | 'searchPlaceholder'
  | 'colUser' | 'colRole' | 'colTrust' | 'colReservations'
  | 'colCommune' | 'colLastActivity' | 'colActions'
  | 'filterRole' | 'filterState'
  | 'stateActive' | 'stateBanned'
  | 'badgeBanned' | 'badgeGdpr'
  | 'emptyForFilters'
  | 'titleUnban' | 'titleBan' | 'titleCancelGdpr' | 'titleRequestGdpr'
  // Confirmations
  | 'promptBanReason' | 'confirmUnban' | 'confirmRole' | 'confirmGdprRequest'
  | 'confirmCancelGdpr'
  | 'demoBlocker'

const STRINGS: Record<Lang, Record<UsersKey, string>> = {
  fr: {
    pageTitle:           'Utilisateurs',
    metaTitle:           'Utilisateurs · SportLocker ops',
    displayed1:          'affiché',
    displayedMany:       'affichés',
    staff:               'staff',
    banned1:             'banni',
    bannedMany:          'bannis',
    gdprPending:         'RGPD en attente',
    searchPlaceholder:   'email ou nom…',
    colUser:             'Utilisateur',
    colRole:             'Rôle',
    colTrust:            'Confiance',
    colReservations:     'Résa.',
    colCommune:          'Commune',
    colLastActivity:     'Dernière activité',
    colActions:          'Actions',
    filterRole:          'Rôle',
    filterState:         'État',
    stateActive:         'actif',
    stateBanned:         'banni',
    badgeBanned:         'banni',
    badgeGdpr:           'RGPD',
    emptyForFilters:     'Aucun utilisateur pour ces filtres.',
    titleUnban:          'Débannir',
    titleBan:            'Bannir',
    titleCancelGdpr:     'Annuler la demande RGPD',
    titleRequestGdpr:    'Déclencher suppression RGPD',
    promptBanReason:     'Raison du bannissement (min. 4 caractères) :',
    confirmUnban:        'Débannir %s ?',
    confirmRole:         'Passer %s en rôle "%r" ?',
    confirmGdprRequest:  'Demander la suppression RGPD de %s ?\n\nLes données seront anonymisées automatiquement après 30 jours. Cette demande peut être annulée tant que la suppression effective n\'a pas eu lieu.',
    confirmCancelGdpr:   'Annuler la demande RGPD pour %s ?',
    demoBlocker:         'Mode démo — branchez un token admin valide pour modifier les utilisateurs.',
  },
  en: {
    pageTitle:           'Users',
    metaTitle:           'Users · SportLocker ops',
    displayed1:          'shown',
    displayedMany:       'shown',
    staff:               'staff',
    banned1:             'banned',
    bannedMany:          'banned',
    gdprPending:         'GDPR pending',
    searchPlaceholder:   'email or name…',
    colUser:             'User',
    colRole:             'Role',
    colTrust:            'Trust',
    colReservations:     'Resv.',
    colCommune:          'Commune',
    colLastActivity:     'Last activity',
    colActions:          'Actions',
    filterRole:          'Role',
    filterState:         'State',
    stateActive:         'active',
    stateBanned:         'banned',
    badgeBanned:         'banned',
    badgeGdpr:           'GDPR',
    emptyForFilters:     'No users match these filters.',
    titleUnban:          'Unban',
    titleBan:            'Ban',
    titleCancelGdpr:     'Cancel GDPR request',
    titleRequestGdpr:    'Trigger GDPR deletion',
    promptBanReason:     'Reason for ban (min. 4 chars):',
    confirmUnban:        'Unban %s?',
    confirmRole:         'Set %s to role "%r"?',
    confirmGdprRequest:  'Request GDPR deletion for %s?\n\nData will be anonymised automatically after 30 days. This request can be cancelled before actual deletion occurs.',
    confirmCancelGdpr:   'Cancel GDPR request for %s?',
    demoBlocker:         'Demo mode — connect a valid admin token to modify users.',
  },
}

export function usersStrings(lang: Lang): Record<UsersKey, string> {
  return STRINGS[lang]
}

// Rôles utilisateur — alignés sur le schéma DB (citizen, operator, admin,
// super_admin). En anglais on garde le slug technique car affiché dans le
// select du tableau, mais on traduit le label du <p> "Super-admin · 1 commune".
const ROLE_LABELS: Record<Lang, Record<UserRole, string>> = {
  fr: {
    citizen:     'citoyen',
    operator:    'opérateur',
    admin:       'admin',
    super_admin: 'super-admin',
  },
  en: {
    citizen:     'citizen',
    operator:    'operator',
    admin:       'admin',
    super_admin: 'super-admin',
  },
}

export function userRoleLabel(lang: Lang, role: UserRole): string {
  return ROLE_LABELS[lang][role]
}
