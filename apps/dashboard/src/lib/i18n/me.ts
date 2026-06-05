import type { Lang } from '../lang'
import type { SessionPayload } from '../session'

type MeKey =
  | 'metaTitle'
  | 'roleSuperAdmin' | 'roleAdmin' | 'roleOperator'
  | 'communeAssigned'
  // Sections
  | 'sectionProfile' | 'sectionMyCommune' | 'sectionMyStats'
  | 'sectionSystem' | 'sectionSecurity'
  // Profile rows
  | 'rowEmail' | 'rowLastActivity' | 'rowAccountCreated' | 'rowPhone'
  | 'notAvailable'
  // Contract statuses
  | 'contractActive' | 'contractExpiringSoon' | 'contractExpired' | 'contractNone'
  | 'contractPrefix'
  // Commune card
  | 'monthlyFee' | 'inseeCode' | 'population' | 'populationSuffix'
  | 'contractStart' | 'contractEnd' | 'contactEmail' | 'contactPhone'
  | 'department' | 'cp'
  // StatCards (admin)
  | 'kpiDeployedDist' | 'kpiDeployedDistHintOnline' | 'kpiDeployedDistHintDemo'
  | 'kpiTotalLockers' | 'kpiTotalLockersHintFree' | 'kpiTotalLockersHintDemo'
  | 'kpiRes30d' | 'kpiRes30dHintReal' | 'kpiRes30dHintDemo'
  | 'kpiFillRate' | 'kpiFillRateHint'
  // StatCards (super_admin)
  | 'kpiCommunesManaged' | 'kpiCommunesManagedHint' | 'kpiCommunesManagedHintDemo'
  | 'kpiDistributors' | 'kpiDistributorsHint'
  | 'kpiRes7d' | 'kpiRes7dHint'
  | 'kpiFeaturedCommune' | 'kpiNoCommune'
  | 'distributorSingular' | 'distributorPlural'
  // Security
  | 'securityHelp' | 'btnSending' | 'btnReset' | 'sentTo' | 'sentErrorTitle' | 'sentUnknownError'

const STRINGS: Record<Lang, Record<MeKey, string>> = {
  fr: {
    metaTitle:                 'Mon compte · SportLocker ops',
    roleSuperAdmin:            'Super-admin',
    roleAdmin:                 'Admin',
    roleOperator:              'Opérateur',
    communeAssigned:           'Commune assignée',
    sectionProfile:            'Profil',
    sectionMyCommune:          'Ma commune',
    sectionMyStats:            'Mes statistiques',
    sectionSystem:             'Vue système',
    sectionSecurity:           'Sécurité',
    rowEmail:                  'Email',
    rowLastActivity:           'Dernière activité',
    rowAccountCreated:         'Compte créé le',
    rowPhone:                  'Téléphone',
    notAvailable:              'non disponible',
    contractActive:            'actif',
    contractExpiringSoon:      '< 60 j',
    contractExpired:           'expiré',
    contractNone:              'sans contrat',
    contractPrefix:            'Contrat',
    monthlyFee:                'Loyer mensuel',
    inseeCode:                 'Code INSEE',
    population:                'Population',
    populationSuffix:          'hab.',
    contractStart:             'Début contrat',
    contractEnd:               'Fin contrat',
    contactEmail:              'Contact email',
    contactPhone:              'Contact téléphone',
    department:                'département',
    cp:                        'CP',
    kpiDeployedDist:           'Distributeurs déployés',
    kpiDeployedDistHintOnline: '%d online',
    kpiDeployedDistHintDemo:   'données fictives',
    kpiTotalLockers:           'Casiers totaux',
    kpiTotalLockersHintFree:   '%d libres',
    kpiTotalLockersHintDemo:   'branchez un token admin',
    kpiRes30d:                 'Réservations 30j',
    kpiRes30dHintReal:         'derniers 30 jours',
    kpiRes30dHintDemo:         'série démo',
    kpiFillRate:               'Taux d’occupation',
    kpiFillRateHint:           'casiers occupés / total',
    kpiCommunesManaged:        'Communes managées',
    kpiCommunesManagedHint:    'tenants actifs',
    kpiCommunesManagedHintDemo:'données fictives',
    kpiDistributors:           'Distributeurs',
    kpiDistributorsHint:       'parc total déployé',
    kpiRes7d:                  'Réservations 7j',
    kpiRes7dHint:              'tous tenants confondus',
    kpiFeaturedCommune:        'Commune vedette',
    kpiNoCommune:              'aucune commune',
    distributorSingular:       'distributeur',
    distributorPlural:         'distributeurs',
    securityHelp:              'Le mot de passe est géré par Firebase Auth. Pour le modifier, demande un lien par email — tu seras redirigé vers une page sécurisée Firebase.',
    btnSending:                'Envoi en cours…',
    btnReset:                  'Changer mon mot de passe',
    sentTo:                    'Email envoyé à',
    sentErrorTitle:            'Échec de l’envoi du mail',
    sentUnknownError:          'Erreur inconnue',
  },
  en: {
    metaTitle:                 'My account · SportLocker ops',
    roleSuperAdmin:            'Super-admin',
    roleAdmin:                 'Admin',
    roleOperator:              'Operator',
    communeAssigned:           'Assigned commune',
    sectionProfile:            'Profile',
    sectionMyCommune:          'My commune',
    sectionMyStats:            'My statistics',
    sectionSystem:             'System view',
    sectionSecurity:           'Security',
    rowEmail:                  'Email',
    rowLastActivity:           'Last activity',
    rowAccountCreated:         'Account created',
    rowPhone:                  'Phone',
    notAvailable:              'not available',
    contractActive:            'active',
    contractExpiringSoon:      '< 60d',
    contractExpired:           'expired',
    contractNone:              'no contract',
    contractPrefix:            'Contract',
    monthlyFee:                'Monthly fee',
    inseeCode:                 'INSEE code',
    population:                'Population',
    populationSuffix:          'inhab.',
    contractStart:             'Contract start',
    contractEnd:               'Contract end',
    contactEmail:              'Contact email',
    contactPhone:              'Contact phone',
    department:                'department',
    cp:                        'PC',
    kpiDeployedDist:           'Deployed distributors',
    kpiDeployedDistHintOnline: '%d online',
    kpiDeployedDistHintDemo:   'sample data',
    kpiTotalLockers:           'Total lockers',
    kpiTotalLockersHintFree:   '%d free',
    kpiTotalLockersHintDemo:   'connect an admin token',
    kpiRes30d:                 'Reservations 30d',
    kpiRes30dHintReal:         'last 30 days',
    kpiRes30dHintDemo:         'demo series',
    kpiFillRate:               'Occupancy rate',
    kpiFillRateHint:           'occupied / total lockers',
    kpiCommunesManaged:        'Managed communes',
    kpiCommunesManagedHint:    'active tenants',
    kpiCommunesManagedHintDemo:'sample data',
    kpiDistributors:           'Distributors',
    kpiDistributorsHint:       'total fleet',
    kpiRes7d:                  'Reservations 7d',
    kpiRes7dHint:              'all tenants combined',
    kpiFeaturedCommune:        'Featured commune',
    kpiNoCommune:              'no commune',
    distributorSingular:       'distributor',
    distributorPlural:         'distributors',
    securityHelp:              'The password is managed by Firebase Auth. To change it, request a link by email — you will be redirected to a secure Firebase page.',
    btnSending:                'Sending…',
    btnReset:                  'Change my password',
    sentTo:                    'Email sent to',
    sentErrorTitle:            'Failed to send email',
    sentUnknownError:          'Unknown error',
  },
}

export function meStrings(lang: Lang): Record<MeKey, string> {
  return STRINGS[lang]
}

export function roleLabel(lang: Lang, role: SessionPayload['role']): string {
  const t = meStrings(lang)
  return role === 'super_admin' ? t.roleSuperAdmin : role === 'admin' ? t.roleAdmin : t.roleOperator
}
