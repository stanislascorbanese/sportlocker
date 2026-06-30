import type { Lang } from '../lang'
import type { ItemCondition } from '../api'

type ItemsKey =
  | 'pageTitle' | 'metaTitle' | 'metaTitleNewType' | 'metaTitleEditType'
  | 'metaTitleNewInstance' | 'metaTitleEditInstance'
  | 'inCatalog' | 'type1' | 'typeMany' | 'physical1' | 'physicalMany'
  | 'damaged1' | 'damagedMany' | 'lost1' | 'lostMany'
  | 'tabTypes' | 'tabInstances'
  | 'btnNewType' | 'btnNewInstance' | 'btnNewTypeSAOnly'
  // Types table
  | 'colType' | 'colCategory' | 'colCaution' | 'colMaxDuration'
  | 'colItems' | 'colLoans' | 'colActions'
  | 'noTypes'
  | 'readonly'
  // Instances table
  | 'colRfid' | 'colCondition' | 'colLocation' | 'colInspection'
  | 'noItemsForFilters' | 'orphan' | 'lockerHash' | 'never'
  | 'filtersLabel' | 'allConditions' | 'allTypes'
  | 'okButton'
  // Conditions
  | 'condNew' | 'condGood' | 'condWorn' | 'condDamaged' | 'condLost'
  // Forms (ItemForm + ItemTypeForm)
  | 'formItemTypeName' | 'formItemTypeSlug' | 'formItemTypeCategory'
  | 'formItemTypeImage' | 'formCautionCents' | 'formMaxDurationMin'
  | 'formItemTypeImageHint'
  | 'formRfid' | 'formItemType' | 'formCondition' | 'formNotes'
  | 'formLocker' | 'formLockerHint' | 'formInspected' | 'formInspectedHint'
  | 'formNoLocker'
  | 'btnSubmitCreateType' | 'btnSubmitSaveType' | 'btnSubmitSubmitting'
  | 'btnSubmitCreateInstance' | 'btnSubmitSaveInstance'
  | 'btnCancel' | 'btnBack'
  | 'btnDelete' | 'btnDeleteConfirm' | 'btnDeleteBlockedTitle'
  // Subpage titles
  | 'subtitleNewType' | 'subtitleEditType'
  | 'subtitleNewInstance' | 'subtitleEditInstance'

const STRINGS: Record<Lang, Record<ItemsKey, string>> = {
  fr: {
    pageTitle:             'Articles',
    metaTitle:             'Articles · SportLocker ops',
    metaTitleNewType:      'Nouveau type · SportLocker',
    metaTitleEditType:     'Modifier type · SportLocker',
    metaTitleNewInstance:  'Nouvel article · SportLocker',
    metaTitleEditInstance: 'Modifier article · SportLocker',
    inCatalog:             'dans le catalogue',
    type1:                 'type',
    typeMany:              'types',
    physical1:             'article physique',
    physicalMany:          'articles physiques',
    damaged1:              'endommagé',
    damagedMany:           'endommagés',
    lost1:                 'perdu',
    lostMany:              'perdus',
    tabTypes:              "Types d'articles",
    tabInstances:          'Articles physiques',
    btnNewType:            '+ Nouveau type',
    btnNewInstance:        '+ Nouvel article',
    btnNewTypeSAOnly:      'Création réservée aux super-admins',

    colType:               'Type',
    colCategory:           'Catégorie',
    colCaution:            'Caution',
    colMaxDuration:        'Durée max',
    colItems:              'Articles',
    colLoans:              'Emprunts',
    colActions:            'Actions',
    noTypes:               'Aucun type au catalogue.',
    readonly:              'lecture seule',

    colRfid:               'RFID',
    colCondition:          'État',
    colLocation:           'Localisation',
    colInspection:         'Inspection',
    noItemsForFilters:     'Aucun article ne correspond à ces filtres.',
    orphan:                '— orphelin',
    lockerHash:            'Casier #',
    never:                 'jamais',
    filtersLabel:          'Filtres',
    allConditions:         'Toutes conditions',
    allTypes:              'Tous types',
    okButton:              'OK',

    condNew:               'neuf',
    condGood:              'bon',
    condWorn:              'usé',
    condDamaged:           'endommagé',
    condLost:              'perdu',

    formItemTypeName:      'Nom du type',
    formItemTypeSlug:      'Slug (URL)',
    formItemTypeCategory:  'Catégorie',
    formItemTypeImage:     'URL de l’image',
    formItemTypeImageHint: 'Optionnel · URL HTTPS d’une image carrée 400×400 min.',
    formCautionCents:      'Caution (€)',
    formMaxDurationMin:    'Durée max (min)',

    formRfid:              'Tag RFID',
    formItemType:          'Type',
    formCondition:         'État',
    formNotes:             'Notes (optionnel)',
    formLocker:            'Casier (optionnel)',
    formLockerHint:        'Si vide, l’article est en stock libre — pas attribué à un casier.',
    formInspected:         'Dernière inspection',
    formInspectedHint:     'Laisser vide pour ne pas écraser une inspection antérieure.',
    formNoLocker:          'Aucun (stock libre)',

    btnSubmitCreateType:    'Créer le type',
    btnSubmitSaveType:      'Enregistrer',
    btnSubmitSubmitting:    'Envoi…',
    btnSubmitCreateInstance:"Créer l’article",
    btnSubmitSaveInstance:  'Enregistrer',
    btnCancel:              'Annuler',
    btnBack:                'Retour',
    btnDelete:              'Supprimer',
    btnDeleteConfirm:       'Confirmer la suppression ?',
    btnDeleteBlockedTitle:  'Suppression bloquée tant que des articles physiques utilisent ce type',

    subtitleNewType:       'Crée un nouveau type au catalogue.',
    subtitleEditType:      'Caution, durée maxi, image — les changements impactent tous les articles physiques.',
    subtitleNewInstance:   'Enregistre un nouvel article physique au parc.',
    subtitleEditInstance:  'État, localisation, inspection — modifie en quelques clics.',
  },
  en: {
    pageTitle:             'Items',
    metaTitle:             'Items · SportLocker ops',
    metaTitleNewType:      'New type · SportLocker',
    metaTitleEditType:     'Edit type · SportLocker',
    metaTitleNewInstance:  'New item · SportLocker',
    metaTitleEditInstance: 'Edit item · SportLocker',
    inCatalog:             'in catalog',
    type1:                 'type',
    typeMany:              'types',
    physical1:             'physical item',
    physicalMany:          'physical items',
    damaged1:              'damaged',
    damagedMany:           'damaged',
    lost1:                 'lost',
    lostMany:              'lost',
    tabTypes:              'Item types',
    tabInstances:          'Physical items',
    btnNewType:            '+ New type',
    btnNewInstance:        '+ New item',
    btnNewTypeSAOnly:      'Creation restricted to super-admins',

    colType:               'Type',
    colCategory:           'Category',
    colCaution:            'Deposit',
    colMaxDuration:        'Max duration',
    colItems:              'Items',
    colLoans:              'Loans',
    colActions:            'Actions',
    noTypes:               'No type in catalog.',
    readonly:              'read-only',

    colRfid:               'RFID',
    colCondition:          'Condition',
    colLocation:           'Location',
    colInspection:         'Inspection',
    noItemsForFilters:     'No item matches these filters.',
    orphan:                '— orphan',
    lockerHash:            'Locker #',
    never:                 'never',
    filtersLabel:          'Filters',
    allConditions:         'All conditions',
    allTypes:              'All types',
    okButton:              'OK',

    condNew:               'new',
    condGood:              'good',
    condWorn:              'worn',
    condDamaged:           'damaged',
    condLost:              'lost',

    formItemTypeName:      'Type name',
    formItemTypeSlug:      'Slug (URL)',
    formItemTypeCategory:  'Category',
    formItemTypeImage:     'Image URL',
    formItemTypeImageHint: 'Optional · HTTPS URL of a square image 400×400 min.',
    formCautionCents:      'Deposit (€)',
    formMaxDurationMin:    'Max duration (min)',

    formRfid:              'RFID tag',
    formItemType:          'Type',
    formCondition:         'Condition',
    formNotes:             'Notes (optional)',
    formLocker:            'Locker (optional)',
    formLockerHint:        'If empty, the item is in free stock — not assigned to a locker.',
    formInspected:         'Last inspection',
    formInspectedHint:     'Leave empty to keep the previous inspection date.',
    formNoLocker:          'None (free stock)',

    btnSubmitCreateType:    'Create type',
    btnSubmitSaveType:      'Save',
    btnSubmitSubmitting:    'Submitting…',
    btnSubmitCreateInstance:'Create item',
    btnSubmitSaveInstance:  'Save',
    btnCancel:              'Cancel',
    btnBack:                'Back',
    btnDelete:              'Delete',
    btnDeleteConfirm:       'Confirm deletion?',
    btnDeleteBlockedTitle:  'Deletion blocked while physical items still use this type',

    subtitleNewType:       'Create a new type in the catalog.',
    subtitleEditType:      'Deposit, max duration, image — changes impact every physical item.',
    subtitleNewInstance:   'Register a new physical item in the fleet.',
    subtitleEditInstance:  'Condition, location, inspection — edit in a few clicks.',
  },
}

export function itemsStrings(lang: Lang): Record<ItemsKey, string> {
  return STRINGS[lang]
}

const COND_LABELS: Record<Lang, Record<ItemCondition, string>> = {
  fr: {
    new:     'neuf',
    good:    'bon',
    worn:    'usé',
    damaged: 'endommagé',
    lost:    'perdu',
  },
  en: {
    new:     'new',
    good:    'good',
    worn:    'worn',
    damaged: 'damaged',
    lost:    'lost',
  },
}

export function conditionLabel(lang: Lang, cond: ItemCondition): string {
  return COND_LABELS[lang][cond]
}
