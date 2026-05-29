import type { Lang } from '../lang'

type DistributorsKey =
  // En-tête + sous-titre
  | 'pageTitle' | 'metaTitle'
  | 'subtitle1' | 'subtitleMany' | 'lockersFree' | 'lockersFreeOf'
  | 'newDistributor'
  // États vides / erreurs
  | 'emptyState' | 'emptyHint'
  // En-têtes de table
  | 'colDistributor' | 'colStatus' | 'colLockersFree' | 'colBattery'
  | 'colPosition' | 'colLastSeen' | 'colActions'
  // Modificateurs
  | 'distributorsCount1' | 'distributorsCountMany'

const STRINGS: Record<Lang, Record<DistributorsKey, string>> = {
  fr: {
    pageTitle:              'Parc de distributeurs',
    metaTitle:              'Distributeurs · SportLocker ops',
    subtitle1:              'distributeur',
    subtitleMany:           'distributeurs',
    lockersFree:            'casier libre',
    lockersFreeOf:          'casiers libres',
    newDistributor:         '+ Nouveau',
    emptyState:             'Aucun distributeur en base. Créez-en un via',
    emptyHint:              'POST /v1/distributors',
    colDistributor:         'Distributeur',
    colStatus:              'Statut',
    colLockersFree:         'Casiers libres',
    colBattery:             'Batterie',
    colPosition:            'Position',
    colLastSeen:            'Dernier signe',
    colActions:             'Actions',
    distributorsCount1:     'distributeur',
    distributorsCountMany:  'distributeurs',
  },
  en: {
    pageTitle:              'Distributor fleet',
    metaTitle:              'Distributors · SportLocker ops',
    subtitle1:              'distributor',
    subtitleMany:           'distributors',
    lockersFree:            'locker free',
    lockersFreeOf:          'lockers free',
    newDistributor:         '+ New',
    emptyState:             'No distributors yet. Create one via',
    emptyHint:              'POST /v1/distributors',
    colDistributor:         'Distributor',
    colStatus:              'Status',
    colLockersFree:         'Free lockers',
    colBattery:             'Battery',
    colPosition:            'Position',
    colLastSeen:            'Last seen',
    colActions:             'Actions',
    distributorsCount1:     'distributor',
    distributorsCountMany:  'distributors',
  },
}

export function distributorsStrings(lang: Lang): Record<DistributorsKey, string> {
  return STRINGS[lang]
}
