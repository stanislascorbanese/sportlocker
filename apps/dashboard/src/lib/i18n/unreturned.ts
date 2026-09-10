import type { Lang } from '../lang'

/**
 * Dictionnaire de l'écran « non rendus ».
 *
 * Cet écran sert à porter une ligne sur le compte séjour d'un vacancier. Les
 * mots doivent donc rester factuels — « non rendu », pas « vol » : on ne sait
 * pas encore si l'article est perdu ou simplement resté sous la tente.
 *
 * Il n'y a plus de notion de retard depuis le passage aux emprunts : un prêt
 * n'a pas d'heure de retour promise, seulement une durée depuis la sortie.
 */

type Key =
  | 'title' | 'eyebrow' | 'description'
  | 'noneTitle' | 'noneHint'
  | 'spot' | 'guest' | 'item' | 'kiosk' | 'locker' | 'since' | 'leaves'
  | 'charged' | 'chargedYes' | 'chargedNo' | 'chargeFailed'
  | 'hours' | 'days' | 'billHint'

const STRINGS: Record<Lang, Record<Key, string>> = {
  fr: {
    title:          'Non rendus',
    eyebrow:        'À traiter',
    description:    'Le matériel encore dehors. À porter sur le compte séjour si besoin.',
    noneTitle:      'Tout est rentré',
    noneHint:       'Aucun article n’est dehors ce matin.',
    spot:           'Emplacement',
    guest:          'Vacancier',
    item:           'Article',
    kiosk:          'Borne',
    locker:         'casier',
    since:          'Sorti depuis',
    leaves:         'Départ',
    charged:        'Compte séjour',
    chargedYes:     'Passé en compte',
    chargedNo:      'À passer',
    chargeFailed:   'Non enregistré',
    hours:          'h',
    days:           'j',
    billHint:       'Portez la ligne sur son compte séjour, comme pour un vélo.',
  },
  en: {
    title:          'Not returned',
    eyebrow:        'Needs action',
    description:    'Gear still out. Charge it to the guest folio if needed.',
    noneTitle:      'Everything is back',
    noneHint:       'Nothing is out this morning.',
    spot:           'Pitch',
    guest:          'Guest',
    item:           'Item',
    kiosk:          'Kiosk',
    locker:         'locker',
    since:          'Out for',
    leaves:         'Leaves',
    charged:        'Folio',
    chargedYes:     'On folio',
    chargedNo:      'To charge',
    chargeFailed:   'Not saved',
    hours:          'h',
    days:           'd',
    billHint:       'Add the line to their folio, same as a bike rental.',
  },
}

export const unreturnedStrings = (lang: Lang) => STRINGS[lang]
