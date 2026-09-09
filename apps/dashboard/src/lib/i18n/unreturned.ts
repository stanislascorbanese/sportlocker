import type { Lang } from '../lang'

/**
 * Dictionnaire de l'écran « non rendus ».
 *
 * Cet écran sert à facturer un client sur son compte séjour. Les mots doivent
 * donc rester factuels — « non rendu », pas « vol » : on ne sait pas encore si
 * l'article est perdu ou simplement resté sous la tente.
 */

type Key =
  | 'title' | 'eyebrow' | 'description'
  | 'noneTitle' | 'noneHint'
  | 'guest' | 'item' | 'kiosk' | 'since' | 'due' | 'lateBy'
  | 'hours' | 'days' | 'billHint' | 'overdueBadge' | 'longOutBadge'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:          'Non rendus',
    eyebrow:        'À traiter',
    description:    'Le matériel encore dehors au-delà du délai. À facturer sur le compte séjour si besoin.',
    noneTitle:      'Tout est rentré',
    noneHint:       'Aucun article n’est en retard.',
    guest:          'Client',
    item:           'Article',
    kiosk:          'Borne',
    since:          'Sorti depuis',
    due:            'Retour attendu',
    lateBy:         'Retard',
    hours:          'h',
    days:           'j',
    billHint:       'Portez la ligne sur son compte séjour, comme pour un vélo.',
    overdueBadge:   'En retard',
    longOutBadge:   'Dehors depuis longtemps',
  },
  en: {
    title:          'Not returned',
    eyebrow:        'Needs action',
    description:    'Gear still out past its due time. Charge it to the guest folio if needed.',
    noneTitle:      'Everything is back',
    noneHint:       'No item is overdue.',
    guest:          'Guest',
    item:           'Item',
    kiosk:          'Kiosk',
    since:          'Out for',
    due:            'Due back',
    lateBy:         'Late by',
    hours:          'h',
    days:           'd',
    billHint:       'Add the line to their folio, same as a bike rental.',
    overdueBadge:   'Overdue',
    longOutBadge:   'Out for a long time',
  },
}

export const unreturnedStrings = (lang: Lang) => STRINGS[lang]
