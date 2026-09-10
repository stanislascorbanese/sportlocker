import type { Lang } from './lang'

/**
 * Dictionnaire FR/EN pour la Sidebar du dashboard ops.
 *
 * Même pattern que `map-i18n.ts` : pas de full i18n encore, juste un objet
 * indexé par langue. Le `LanguageSelector` dans la sidebar pilote ce dico
 * via `useLang()` ; toutes les autres pages restent FR-only pour l'instant
 * (tracking : feat/dashboard-i18n).
 */

type SidebarKey =
  | 'consoleSubtitle'
  | 'navHome' | 'navReassort' | 'navUnreturned' | 'navStays' | 'navMap' | 'navDistributors'
  | 'navHealth' | 'navItems' | 'navCommunes' | 'navUsers' | 'navReservations'
  | 'navMaintenance' | 'navStats' | 'navReports' | 'navAudit'
  | 'navTenants' | 'navAgentOffice'
  | 'groupParc' | 'groupSaison' | 'groupReglages'
  | 'navKiosk' | 'kioskHint'
  | 'oneCommune' | 'logout' | 'loggingOut'
  | 'roleSuperAdmin' | 'roleAdmin' | 'roleOperator'

const STRINGS: Record<Lang, Record<SidebarKey, string>> = {
  fr: {
    consoleSubtitle:  'Console exploitant',
    navHome:          "Aujourd'hui",
    navReassort:      'Réassort',
    navUnreturned:    'Non rendus',
    navStays:         'Séjours',
    navMap:           'Carte',
    navDistributors:  'Bornes',
    navHealth:        'État des bornes',
    navItems:         'Matériel',
    navCommunes:      'Établissements',
    navUsers:         'Utilisateurs',
    navReservations:  'Emprunts',
    navMaintenance:   'Maintenance',
    navStats:         'Statistiques',
    navReports:       'Rapports',
    navAudit:         'Journal',
    navTenants:       'Clients',
    navAgentOffice:   'Agent Office',
    groupParc:        'Mon parc',
    groupSaison:      'Ma saison',
    groupReglages:    'Réglages',
    navKiosk:         'Mode accueil',
    kioskHint:        'Plein écran pour la tablette de la réception',
    oneCommune:       '1 établissement',
    logout:           'Se déconnecter',
    loggingOut:       'Déconnexion…',
    roleSuperAdmin:   'Super-admin',
    roleAdmin:        'Admin',
    roleOperator:     'Opérateur',
  },
  en: {
    consoleSubtitle:  'Operator console',
    navHome:          'Today',
    navReassort:      'Restocking',
    navUnreturned:    'Not returned',
    navStays:         'Stays',
    navMap:           'Map',
    navDistributors:  'Kiosks',
    navHealth:        'Kiosk status',
    navItems:         'Gear',
    navCommunes:      'Properties',
    navUsers:         'Users',
    navReservations:  'Loans',
    navMaintenance:   'Maintenance',
    navStats:         'Statistics',
    navReports:       'Reports',
    navAudit:         'Activity log',
    navTenants:       'Clients',
    navAgentOffice:   'Agent Office',
    groupParc:        'My kiosks',
    groupSaison:      'My season',
    groupReglages:    'Settings',
    navKiosk:         'Front-desk mode',
    kioskHint:        'Full screen for the reception tablet',
    oneCommune:       '1 property',
    logout:           'Sign out',
    loggingOut:       'Signing out…',
    roleSuperAdmin:   'Super-admin',
    roleAdmin:        'Admin',
    roleOperator:     'Operator',
  },
}

export function sidebarStrings(lang: Lang): Record<SidebarKey, string> {
  return STRINGS[lang]
}
