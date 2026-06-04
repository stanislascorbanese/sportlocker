import type { Lang } from '../lang'

type CommunesKey =
  // Liste
  | 'pageTitle' | 'metaTitle' | 'metaTitleNew' | 'metaTitleEdit'
  | 'communes1' | 'communesMany' | 'contractActive1' | 'contractActiveMany'
  | 'distributorDeployed1' | 'distributorDeployedMany'
  | 'monthlyRevenueRecurring'
  | 'newCommune' | 'newCommuneSubtitle'
  // Statuts contrat
  | 'contractStatusActive' | 'contractStatusExpiringSoon'
  | 'contractStatusExpired' | 'contractStatusNone'
  // Table
  | 'colCommune' | 'colInsee' | 'colRegionDept' | 'colContract'
  | 'colFeeMonthly' | 'colDistributors' | 'colContact' | 'colActions'
  | 'department'
  | 'distrubutorsAbbrev'
  // Form sections + champs
  | 'addressTitle' | 'subtitleEdit'
  | 'autocompleteLabel' | 'autocompleteAutoFilled' | 'autocompletePlaceholder'
  | 'autocompleteLoading' | 'autocompleteSource' | 'autocompleteKbdNavigate'
  | 'autocompleteKbdSelect' | 'autocompleteKbdClose'
  | 'fieldInseeCode' | 'fieldInseeHint5' | 'fieldInseeHintImmutable'
  | 'fieldPostalCode' | 'fieldName' | 'fieldDepartment' | 'fieldRegion'
  | 'fieldPopulation'
  | 'fieldsetContract' | 'fieldStart' | 'fieldEnd' | 'fieldMonthlyFee'
  | 'fieldsetContact' | 'fieldEmail' | 'fieldPhone'
  | 'createCommune' | 'saveCommune'

const STRINGS: Record<Lang, Record<CommunesKey, string>> = {
  fr: {
    pageTitle:              'Communes',
    metaTitle:              'Communes · SportLocker ops',
    metaTitleNew:           'Nouvelle commune · SportLocker',
    metaTitleEdit:          'Modifier commune · SportLocker',
    communes1:              'commune',
    communesMany:           'communes',
    contractActive1:        'contrat actif',
    contractActiveMany:     'contrats actifs',
    distributorDeployed1:   'distributeur déployé',
    distributorDeployedMany:'distributeurs déployés',
    monthlyRevenueRecurring:'/ mois récurrent',
    newCommune:             '+ Nouvelle commune',
    newCommuneSubtitle:     'Ajoute une commune cliente et son contrat.',

    contractStatusActive:        'actif',
    contractStatusExpiringSoon:  '< 60 j',
    contractStatusExpired:       'expiré',
    contractStatusNone:          'sans contrat',

    colCommune:         'Commune',
    colInsee:           'Code INSEE',
    colRegionDept:      'Région · Dept.',
    colContract:        'Contrat',
    colFeeMonthly:      'Fee / mois',
    colDistributors:    'Distrib.',
    colContact:         'Contact',
    colActions:         'Actions',
    department:         'Département',
    distrubutorsAbbrev: 'distributeurs rattachés',

    addressTitle:               'Adresse',
    subtitleEdit:               'rattaché',

    autocompleteLabel:          '🔎 Rechercher une commune (auto-remplit le formulaire)',
    autocompleteAutoFilled:     '✓ Auto-rempli depuis INSEE',
    autocompletePlaceholder:    'Paris 11e, 75011, Lyon, Marseille…',
    autocompleteLoading:        'Recherche…',
    autocompleteSource:         'Source :',
    autocompleteKbdNavigate:    'naviguer',
    autocompleteKbdSelect:      'sélectionner',
    autocompleteKbdClose:       'fermer',

    fieldInseeCode:             'Code INSEE',
    fieldInseeHint5:            '5 chiffres',
    fieldInseeHintImmutable:    'Non modifiable après création',
    fieldPostalCode:            'Code postal',
    fieldName:                  'Nom',
    fieldDepartment:            'Département',
    fieldRegion:                'Région',
    fieldPopulation:            'Population (optionnel)',
    fieldsetContract:           'Contrat',
    fieldStart:                 'Début',
    fieldEnd:                   'Fin',
    fieldMonthlyFee:            'Fee mensuel (€)',
    fieldsetContact:            'Contact',
    fieldEmail:                 'Email',
    fieldPhone:                 'Téléphone',
    createCommune:              'Créer la commune',
    saveCommune:                'Enregistrer',
  },
  en: {
    pageTitle:              'Communes',
    metaTitle:              'Communes · SportLocker ops',
    metaTitleNew:           'New commune · SportLocker',
    metaTitleEdit:          'Edit commune · SportLocker',
    communes1:              'commune',
    communesMany:           'communes',
    contractActive1:        'active contract',
    contractActiveMany:     'active contracts',
    distributorDeployed1:   'distributor deployed',
    distributorDeployedMany:'distributors deployed',
    monthlyRevenueRecurring:'/ month recurring',
    newCommune:             '+ New commune',
    newCommuneSubtitle:     'Add a client commune and its contract.',

    contractStatusActive:        'active',
    contractStatusExpiringSoon:  '< 60d',
    contractStatusExpired:       'expired',
    contractStatusNone:          'no contract',

    colCommune:         'Commune',
    colInsee:           'INSEE code',
    colRegionDept:      'Region · Dept.',
    colContract:        'Contract',
    colFeeMonthly:      'Fee / month',
    colDistributors:    'Distrib.',
    colContact:         'Contact',
    colActions:         'Actions',
    department:         'Department',
    distrubutorsAbbrev: 'attached distributors',

    addressTitle:               'Address',
    subtitleEdit:               'attached',

    autocompleteLabel:          '🔎 Search a commune (auto-fills the form)',
    autocompleteAutoFilled:     '✓ Auto-filled from INSEE',
    autocompletePlaceholder:    'Paris 11e, 75011, Lyon, Marseille…',
    autocompleteLoading:        'Searching…',
    autocompleteSource:         'Source:',
    autocompleteKbdNavigate:    'navigate',
    autocompleteKbdSelect:      'select',
    autocompleteKbdClose:       'close',

    fieldInseeCode:             'INSEE code',
    fieldInseeHint5:            '5 digits',
    fieldInseeHintImmutable:    'Cannot be edited after creation',
    fieldPostalCode:            'Postal code',
    fieldName:                  'Name',
    fieldDepartment:            'Department',
    fieldRegion:                'Region',
    fieldPopulation:            'Population (optional)',
    fieldsetContract:           'Contract',
    fieldStart:                 'Start',
    fieldEnd:                   'End',
    fieldMonthlyFee:            'Monthly fee (€)',
    fieldsetContact:            'Contact',
    fieldEmail:                 'Email',
    fieldPhone:                 'Phone',
    createCommune:              'Create commune',
    saveCommune:                'Save',
  },
}

export function communesStrings(lang: Lang): Record<CommunesKey, string> {
  return STRINGS[lang]
}
