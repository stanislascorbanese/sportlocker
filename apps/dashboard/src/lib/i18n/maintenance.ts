import type { Lang } from '../lang'
import type { MaintenanceStatus } from '../api'

type MaintenanceKey =
  | 'pageTitle' | 'metaTitle' | 'detailMetaTitle'
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
  // Badge auto (opened_by NULL)
  | 'badgeAuto' | 'badgeAutoTitle' | 'cardViewDetail'
  // Detail page
  | 'detailBack'
  | 'secDescription' | 'noDescription'
  | 'secContext' | 'fieldDistributor' | 'fieldLocker' | 'fieldItem'
  | 'fieldOpenedBy' | 'openedByAuto' | 'fieldCreated' | 'fieldStatus'
  | 'lockerPosition' | 'resolutionNoteLabel'
  | 'secAssignee' | 'assignLabel' | 'unassigned' | 'assignSelf'
  | 'secComments' | 'commentsEmpty' | 'commentPlaceholder' | 'commentSubmit' | 'commentBy'
  | 'secHistory' | 'historyEmpty' | 'historyBy' | 'historyOpened'
  // Status labels
  | 'statusOpen' | 'statusInProgress' | 'statusResolved' | 'statusWontfix'

const STRINGS: Record<Lang, Record<MaintenanceKey, string>> = {
  fr: {
    pageTitle:         'Tickets de maintenance',
    metaTitle:         'Maintenance · SportLocker ops',
    detailMetaTitle:   'Ticket · SportLocker ops',
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
    badgeAuto:         'Auto',
    badgeAutoTitle:    'Ticket ouvert automatiquement (surveillance / cron)',
    cardViewDetail:    'Voir le détail du ticket',
    detailBack:        '← Tous les tickets',
    secDescription:    'Description',
    noDescription:     'Aucune description fournie.',
    secContext:        'Contexte',
    fieldDistributor:  'Distributeur',
    fieldLocker:       'Casier',
    fieldItem:         'Article',
    fieldOpenedBy:     'Ouvert par',
    openedByAuto:      'Système (automatique)',
    fieldCreated:      'Créé le',
    fieldStatus:       'Statut',
    lockerPosition:    'Position',
    resolutionNoteLabel: 'Note de résolution',
    secAssignee:       'Assignation',
    assignLabel:       'Assigner à',
    unassigned:        'Non assigné',
    assignSelf:        '(personne)',
    secComments:       'Commentaires internes',
    commentsEmpty:     'Aucun commentaire pour le moment.',
    commentPlaceholder: 'Ajouter un commentaire interne…',
    commentSubmit:     'Commenter',
    commentBy:         'par',
    secHistory:        'Historique des transitions',
    historyEmpty:      'Aucune transition enregistrée.',
    historyBy:         'par',
    historyOpened:     'Ouverture du ticket',
    statusOpen:        'Ouvert',
    statusInProgress:  'En cours',
    statusResolved:    'Résolu',
    statusWontfix:     'Abandonné',
  },
  en: {
    pageTitle:         'Maintenance tickets',
    metaTitle:         'Maintenance · SportLocker ops',
    detailMetaTitle:   'Ticket · SportLocker ops',
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
    badgeAuto:         'Auto',
    badgeAutoTitle:    'Automatically opened ticket (watchdog / cron)',
    cardViewDetail:    'View ticket detail',
    detailBack:        '← All tickets',
    secDescription:    'Description',
    noDescription:     'No description provided.',
    secContext:        'Context',
    fieldDistributor:  'Distributor',
    fieldLocker:       'Locker',
    fieldItem:         'Item',
    fieldOpenedBy:     'Opened by',
    openedByAuto:      'System (automatic)',
    fieldCreated:      'Created',
    fieldStatus:       'Status',
    lockerPosition:    'Position',
    resolutionNoteLabel: 'Resolution note',
    secAssignee:       'Assignment',
    assignLabel:       'Assign to',
    unassigned:        'Unassigned',
    assignSelf:        '(nobody)',
    secComments:       'Internal comments',
    commentsEmpty:     'No comments yet.',
    commentPlaceholder: 'Add an internal comment…',
    commentSubmit:     'Comment',
    commentBy:         'by',
    secHistory:        'Status history',
    historyEmpty:      'No transitions recorded.',
    historyBy:         'by',
    historyOpened:     'Ticket opened',
    statusOpen:        'Open',
    statusInProgress:  'In progress',
    statusResolved:    'Resolved',
    statusWontfix:     'Won\'t fix',
  },
}

export function maintenanceStrings(lang: Lang): Record<MaintenanceKey, string> {
  return STRINGS[lang]
}

export function maintenanceStatusLabel(lang: Lang, status: MaintenanceStatus): string {
  const t = STRINGS[lang]
  switch (status) {
    case 'open':        return t.statusOpen
    case 'in_progress': return t.statusInProgress
    case 'resolved':    return t.statusResolved
    case 'wontfix':     return t.statusWontfix
  }
}
