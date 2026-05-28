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
  | 'navHome' | 'navMap' | 'navDistributors' | 'navItems' | 'navPricing'
  | 'navCommunes' | 'navUsers' | 'navReservations' | 'navMaintenance'
  | 'navStats' | 'navReports' | 'navAudit' | 'navPayments' | 'navTenants'
  | 'oneCommune' | 'logout' | 'loggingOut'
  | 'roleSuperAdmin' | 'roleAdmin' | 'roleOperator'

const STRINGS: Record<Lang, Record<SidebarKey, string>> = {
  fr: {
    consoleSubtitle:  'Console opérateur',
    navHome:          'Accueil',
    navMap:           'Carte',
    navDistributors:  'Distributeurs',
    navItems:         'Articles',
    navPricing:       'Tarification',
    navCommunes:      'Communes',
    navUsers:         'Utilisateurs',
    navReservations:  'Réservations',
    navMaintenance:   'Maintenance',
    navStats:         'Stats',
    navReports:       'Rapports',
    navAudit:         'Audit',
    navPayments:      'Paiements',
    navTenants:       'Tenants',
    oneCommune:       '1 commune',
    logout:           'Se déconnecter',
    loggingOut:       'Déconnexion…',
    roleSuperAdmin:   'Super-admin',
    roleAdmin:        'Admin',
    roleOperator:     'Opérateur',
  },
  en: {
    consoleSubtitle:  'Operator console',
    navHome:          'Home',
    navMap:           'Map',
    navDistributors:  'Distributors',
    navItems:         'Items',
    navPricing:       'Pricing',
    navCommunes:      'Communes',
    navUsers:         'Users',
    navReservations:  'Reservations',
    navMaintenance:   'Maintenance',
    navStats:         'Stats',
    navReports:       'Reports',
    navAudit:         'Audit',
    navPayments:      'Payments',
    navTenants:       'Tenants',
    oneCommune:       '1 commune',
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
