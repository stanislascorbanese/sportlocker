import type { Lang } from '../lang'

type MaintenanceKey =
  | 'pageTitle' | 'metaTitle'
  | 'ticket1' | 'ticketMany' | 'open1' | 'openMany'
  | 'inProgressLabel' | 'kanbanEmpty'
  | 'colOpen' | 'colOpenDesc'
  | 'colInProgress' | 'colInProgressDesc'
  | 'colDone' | 'colDoneDesc'
  // Card actions
  | 'takeOver' | 'resolve' | 'reopen' | 'titleSendBack' | 'titleWontfix'
  // Severity badge prefix
  | 'severityPrefix'
  | 'openedOn' | 'arrowTo'
  | 'demoBlocker'

const STRINGS: Record<Lang, Record<MaintenanceKey, string>> = {
  fr: {
    pageTitle:         'Tickets de maintenance',
    metaTitle:         'Maintenance · SportLocker ops',
    ticket1:           'ticket',
    ticketMany:        'tickets',
    open1:             'ouvert',
    openMany:          'ouverts',
    inProgressLabel:   'en cours',
    kanbanEmpty:       'aucun ticket',
    colOpen:           'Ouverts',
    colOpenDesc:       'À prendre en charge',
    colInProgress:     'En cours',
    colInProgressDesc: 'Assigné, en travail',
    colDone:           'Terminés',
    colDoneDesc:       'Résolus / abandonnés',
    takeOver:          'Prendre en charge →',
    resolve:           '✓ Résoudre',
    reopen:            'Rouvrir',
    titleSendBack:     'Renvoyer dans la pile des tickets ouverts',
    titleWontfix:      'Ne pas traiter',
    severityPrefix:    'S',
    openedOn:          'Ouvert le',
    arrowTo:           '→',
    demoBlocker:       'Mode démo — branchez un token admin valide pour modifier les tickets.',
  },
  en: {
    pageTitle:         'Maintenance tickets',
    metaTitle:         'Maintenance · SportLocker ops',
    ticket1:           'ticket',
    ticketMany:        'tickets',
    open1:             'open',
    openMany:          'open',
    inProgressLabel:   'in progress',
    kanbanEmpty:       'no tickets',
    colOpen:           'Open',
    colOpenDesc:       'To be picked up',
    colInProgress:     'In progress',
    colInProgressDesc: 'Assigned, working',
    colDone:           'Done',
    colDoneDesc:       'Resolved / abandoned',
    takeOver:          'Take over →',
    resolve:           '✓ Resolve',
    reopen:            'Reopen',
    titleSendBack:     'Send back to open tickets queue',
    titleWontfix:      "Won't fix",
    severityPrefix:    'S',
    openedOn:          'Opened',
    arrowTo:           '→',
    demoBlocker:       'Demo mode — connect a valid admin token to modify tickets.',
  },
}

export function maintenanceStrings(lang: Lang): Record<MaintenanceKey, string> {
  return STRINGS[lang]
}
