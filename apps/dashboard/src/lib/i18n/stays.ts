import type { Lang } from '../lang'

/**
 * Dictionnaire de l'écran « Séjours ».
 *
 * Le vocabulaire suit celui de l'hébergeur, pas celui de la base : on dit
 * « emplacement » et non « référence de séjour », « arrivée » et « départ »
 * et non « dates ». C'est ce que le saisonnier lit dans son PMS.
 *
 * Un mot compte particulièrement : l'import ne « synchronise » pas. Il verse
 * un fichier, une fois, et on le redit dans l'aide — quelqu'un qui croit à une
 * synchronisation permanente ne réimporte pas le lendemain.
 */

type Key =
  | 'title' | 'eyebrow' | 'description'
  | 'importTitle' | 'importHint' | 'dropLabel' | 'dropHint' | 'pick' | 'change'
  | 'analysing' | 'previewTitle' | 'previewCount' | 'previewMore'
  | 'columnsFound' | 'columnsIgnored' | 'separator'
  | 'rejectedTitle' | 'rejectedHint' | 'line'
  | 'confirm' | 'importing' | 'cancel'
  | 'doneTitle' | 'doneInserted' | 'doneUpdated' | 'doneRejected' | 'doneAgain'
  | 'colRef' | 'colGuest' | 'colArrives' | 'colDeparts' | 'colStatus'
  | 'colSite'
  | 'siteLabel' | 'siteHint' | 'sitePlaceholder' | 'siteRequired'
  | 'statusOut' | 'statusHere'
  | 'listTitle' | 'listEmpty' | 'listEmptyHint'
  | 'errFile' | 'errEmpty' | 'errTooBig' | 'errNoValidRow' | 'errTooManyRows'
  | 'reasonMissingRef' | 'reasonMissingName' | 'reasonBadArrival'
  | 'reasonBadDeparture' | 'reasonOrder' | 'reasonUnknown'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:            'Séjours',
    eyebrow:          'Vos clients',
    description:      'Les séjours en cours et à venir. C’est ce qui permet au vacancier de s’identifier à la borne.',

    importTitle:      'Importer depuis votre logiciel',
    importHint:       'Exportez vos arrivées en CSV depuis votre PMS et déposez le fichier ici. L’import ne se fait pas tout seul : refaites-le quand vos arrivées changent.',
    dropLabel:        'Déposez votre fichier CSV',
    dropHint:         'ou cliquez pour le choisir · 4 Mo maximum',
    pick:             'Choisir un fichier',
    change:           'Changer de fichier',

    analysing:        'Lecture du fichier…',
    previewTitle:     'Avant de valider',
    previewCount:     'séjours lus',
    previewMore:      'autres lignes non affichées',
    columnsFound:     'Colonnes reconnues',
    columnsIgnored:   'Colonnes ignorées',
    separator:        'Séparateur',

    rejectedTitle:    'Lignes écartées',
    rejectedHint:     'Ces lignes ne seront pas importées. Le reste le sera.',
    line:             'ligne',

    confirm:          'Importer ces séjours',
    importing:        'Import en cours…',
    cancel:           'Annuler',

    doneTitle:        'Import terminé',
    doneInserted:     'nouveaux séjours',
    doneUpdated:      'séjours mis à jour',
    doneRejected:     'lignes écartées',
    doneAgain:        'Importer un autre fichier',

    colRef:           'Emplacement',
    colSite:          'Établissement',
    colGuest:         'Vacancier',
    colArrives:       'Arrivée',
    colDeparts:       'Départ',
    colStatus:        'Matériel',
    statusOut:        'Un article dehors',
    statusHere:       '—',

    siteLabel:        'Établissement concerné',
    siteHint:         'Verser un fichier dans le mauvais établissement ne se rattrape pas : les séjours écrasent ceux qui portent le même numéro.',
    sitePlaceholder:  'Choisissez un établissement…',
    siteRequired:     'Choisissez d’abord l’établissement concerné.',

    listTitle:        'Séjours en cours et à venir',
    listEmpty:        'Aucun séjour enregistré',
    listEmptyHint:    'Importez votre fichier d’arrivées pour que vos clients puissent emprunter.',

    errFile:          'Fichier illisible. Vérifiez qu’il s’agit bien d’un export CSV.',
    errEmpty:         'Le fichier est vide.',
    errTooBig:        'Fichier trop lourd (4 Mo maximum).',
    errNoValidRow:    'Aucune ligne exploitable dans ce fichier.',
    errTooManyRows:   'Fichier trop volumineux : découpez-le en plusieurs exports.',

    reasonMissingRef:      'Emplacement absent',
    reasonMissingName:     'Nom absent',
    reasonBadArrival:      'Date d’arrivée illisible',
    reasonBadDeparture:    'Date de départ illisible',
    reasonOrder:           'Départ avant l’arrivée',
    reasonUnknown:         'Ligne inexploitable',
  },
  en: {
    title:            'Stays',
    eyebrow:          'Your guests',
    description:      'Current and upcoming stays. This is what lets a guest identify themselves at the kiosk.',

    importTitle:      'Import from your software',
    importHint:       'Export your arrivals as CSV from your PMS and drop the file here. This is not a live sync: run it again when your arrivals change.',
    dropLabel:        'Drop your CSV file',
    dropHint:         'or click to pick one · 4 MB maximum',
    pick:             'Choose a file',
    change:           'Choose another file',

    analysing:        'Reading the file…',
    previewTitle:     'Before you confirm',
    previewCount:     'stays read',
    previewMore:      'more rows not shown',
    columnsFound:     'Columns matched',
    columnsIgnored:   'Columns ignored',
    separator:        'Separator',

    rejectedTitle:    'Skipped rows',
    rejectedHint:     'These rows will not be imported. Everything else will.',
    line:             'line',

    confirm:          'Import these stays',
    importing:        'Importing…',
    cancel:           'Cancel',

    doneTitle:        'Import finished',
    doneInserted:     'new stays',
    doneUpdated:      'stays updated',
    doneRejected:     'rows skipped',
    doneAgain:        'Import another file',

    colRef:           'Pitch',
    colSite:          'Site',
    colGuest:         'Guest',
    colArrives:       'Arrival',
    colDeparts:       'Departure',
    colStatus:        'Gear',
    statusOut:        'One item out',
    statusHere:       '—',

    siteLabel:        'Target site',
    siteHint:         'Importing into the wrong site cannot be undone: stays overwrite any that share the same reference.',
    sitePlaceholder:  'Pick a site…',
    siteRequired:     'Pick the target site first.',

    listTitle:        'Current and upcoming stays',
    listEmpty:        'No stay on file',
    listEmptyHint:    'Import your arrivals file so your guests can borrow.',

    errFile:          'Could not read the file. Check that it is a CSV export.',
    errEmpty:         'The file is empty.',
    errTooBig:        'File too large (4 MB maximum).',
    errNoValidRow:    'No usable row in this file.',
    errTooManyRows:   'File too large: split it into several exports.',

    reasonMissingRef:      'Pitch missing',
    reasonMissingName:     'Name missing',
    reasonBadArrival:      'Arrival date unreadable',
    reasonBadDeparture:    'Departure date unreadable',
    reasonOrder:           'Departure before arrival',
    reasonUnknown:         'Row unusable',
  },
}

export const stayStrings = (lang: Lang) => STRINGS[lang]

/** Traduit un code de rejet du parseur. Un code inconnu reste affichable. */
export function rejectReason(lang: Lang, code: string): string {
  const t = STRINGS[lang]
  switch (code) {
    case 'missing_stay_ref':          return t.reasonMissingRef
    case 'missing_last_name':         return t.reasonMissingName
    case 'bad_arrival_date':          return t.reasonBadArrival
    case 'bad_departure_date':        return t.reasonBadDeparture
    case 'departure_before_arrival':  return t.reasonOrder
    default:                          return t.reasonUnknown
  }
}
